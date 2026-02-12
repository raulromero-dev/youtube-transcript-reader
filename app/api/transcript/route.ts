import { NextRequest, NextResponse } from "next/server";

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  // Handle URLs with additional query params like &list=...
  const urlMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (urlMatch) return urlMatch[1];

  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;

  return null;
}

function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)))
    .replace(/\n/g, " ");
}

interface CaptionEntry {
  text: string;
  start: number;
  duration: number;
}

function parseCaptionsXml(xml: string): CaptionEntry[] {
  const entries: CaptionEntry[] = [];
  const regex = /<text start="([^"]*)" dur="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g;
  let match;

  while ((match = regex.exec(xml)) !== null) {
    const start = parseFloat(match[1]);
    const dur = parseFloat(match[2]);
    const text = decodeHtmlEntities(match[3].trim());

    if (text) {
      entries.push({ text, start, duration: dur });
    }
  }

  return entries;
}

interface Paragraph {
  timestamp: string;
  offsetMs: number;
  text: string;
}

function groupIntoParagraphs(segments: CaptionEntry[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let currentText = "";
  let currentTimestamp = "";
  let currentOffsetMs = 0;
  let sentenceCount = 0;

  for (const segment of segments) {
    if (!currentTimestamp) {
      currentTimestamp = formatTimestamp(segment.start);
      currentOffsetMs = Math.floor(segment.start * 1000);
    }

    currentText += (currentText ? " " : "") + segment.text.trim();

    const sentences = segment.text.match(/[.!?]+/g);
    if (sentences) {
      sentenceCount += sentences.length;
    }

    if (sentenceCount >= 3 || currentText.length > 400) {
      paragraphs.push({
        timestamp: currentTimestamp,
        offsetMs: currentOffsetMs,
        text: currentText.trim(),
      });
      currentText = "";
      currentTimestamp = "";
      currentOffsetMs = 0;
      sentenceCount = 0;
    }
  }

  if (currentText.trim()) {
    paragraphs.push({
      timestamp: currentTimestamp,
      offsetMs: currentOffsetMs,
      text: currentText.trim(),
    });
  }

  return paragraphs;
}

async function fetchTranscriptViaInnertube(
  videoId: string,
  lang = "en"
): Promise<CaptionEntry[]> {
  // Step 1: Fetch the video page HTML to get the INNERTUBE_API_KEY
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const pageRes = await fetch(videoUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!pageRes.ok) {
    throw new Error("Failed to fetch YouTube video page");
  }

  const html = await pageRes.text();
  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  if (!apiKeyMatch) {
    throw new Error("Could not extract Innertube API key");
  }
  const apiKey = apiKeyMatch[1];

  // Step 2: Call the Innertube player API (as Android client for reliability)
  const playerRes = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "20.10.38",
          },
        },
        videoId,
      }),
    }
  );

  if (!playerRes.ok) {
    throw new Error("Innertube player API request failed");
  }

  const playerData = await playerRes.json();

  // Step 3: Extract caption tracks
  const tracks =
    playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) {
    throw new Error("No caption tracks found for this video");
  }

  // Try to find the requested language, fall back to first available
  let track = tracks.find(
    (t: { languageCode: string }) => t.languageCode === lang
  );
  if (!track) {
    // Try finding auto-generated English or any English variant
    track = tracks.find((t: { languageCode: string }) =>
      t.languageCode.startsWith(lang)
    );
  }
  if (!track) {
    // Fall back to first available track
    track = tracks[0];
  }

  // Clean the base URL (remove srv3 format if present, use default XML)
  let captionUrl: string = track.baseUrl;
  captionUrl = captionUrl.replace(/&fmt=\w+/, "");

  // Step 4: Fetch and parse the captions XML
  const captionRes = await fetch(captionUrl);
  if (!captionRes.ok) {
    throw new Error("Failed to fetch caption data");
  }

  const xml = await captionRes.text();
  return parseCaptionsXml(xml);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "Please provide a YouTube URL" },
      { status: 400 }
    );
  }

  const videoId = extractVideoId(url);

  if (!videoId) {
    return NextResponse.json(
      { error: "Invalid YouTube URL" },
      { status: 400 }
    );
  }

  try {
    const segments = await fetchTranscriptViaInnertube(videoId);

    if (!segments || segments.length === 0) {
      return NextResponse.json(
        { error: "No transcript available for this video" },
        { status: 404 }
      );
    }

    const paragraphs = groupIntoParagraphs(segments);

    // Fetch video title from oEmbed
    let title = "Untitled Video";
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
      );
      if (oembedRes.ok) {
        const oembed = await oembedRes.json();
        title = oembed.title || title;
      }
    } catch {
      // Ignore title fetch errors
    }

    return NextResponse.json({
      videoId,
      title,
      paragraphs,
      totalSegments: segments.length,
    });
  } catch (error) {
    console.error("Transcript fetch error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      {
        error:
          message.includes("No caption")
            ? "This video does not have captions/subtitles available."
            : "Could not fetch transcript. Please check the URL and try again.",
      },
      { status: 500 }
    );
  }
}
