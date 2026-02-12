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
  console.log("[v0] === Starting transcript fetch for videoId:", videoId);

  // Step 1: Fetch the video page HTML to get the INNERTUBE_API_KEY
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  console.log("[v0] Step 1: Fetching video page:", videoUrl);

  const pageRes = await fetch(videoUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  console.log("[v0] Step 1 response status:", pageRes.status);

  if (!pageRes.ok) {
    throw new Error(`Failed to fetch YouTube video page (status: ${pageRes.status})`);
  }

  const html = await pageRes.text();
  console.log("[v0] Step 1 HTML length:", html.length);

  // Try to extract captions directly from the page HTML first
  const ytInitialPlayerMatch = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
  console.log("[v0] Found ytInitialPlayerResponse in HTML:", !!ytInitialPlayerMatch);

  if (ytInitialPlayerMatch) {
    try {
      const playerData = JSON.parse(ytInitialPlayerMatch[1]);
      console.log("[v0] Parsed ytInitialPlayerResponse successfully");
      console.log("[v0] Has captions key:", !!playerData?.captions);
      console.log("[v0] Has playerCaptionsTracklistRenderer:", !!playerData?.captions?.playerCaptionsTracklistRenderer);

      const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      console.log("[v0] Caption tracks from HTML:", JSON.stringify(tracks?.map((t: { languageCode: string; kind?: string; name?: { simpleText?: string } }) => ({
        lang: t.languageCode,
        kind: t.kind,
        name: t.name?.simpleText,
      })) ?? []));

      if (tracks && tracks.length > 0) {
        console.log("[v0] Using captions from embedded player response");
        return await fetchCaptionsFromTracks(tracks, lang);
      }
    } catch (e) {
      console.log("[v0] Failed to parse ytInitialPlayerResponse:", e instanceof Error ? e.message : e);
    }
  }

  // Fallback: Try extracting from ytInitialData or embedded config
  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  console.log("[v0] Found INNERTUBE_API_KEY:", !!apiKeyMatch, apiKeyMatch?.[1]?.slice(0, 10) + "...");

  if (!apiKeyMatch) {
    // Log a snippet of the HTML to understand what we're getting
    console.log("[v0] HTML snippet (first 1000 chars):", html.slice(0, 1000));
    throw new Error("Could not extract Innertube API key");
  }
  const apiKey = apiKeyMatch[1];

  // Step 2: Call the Innertube player API - try WEB client first (Android is being blocked)
  console.log("[v0] Step 2: Calling Innertube player API with WEB client");

  const playerPayload = {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: "2.20241120.01.00",
        hl: "en",
        gl: "US",
      },
    },
    videoId,
  };

  console.log("[v0] Player API payload:", JSON.stringify(playerPayload));

  const playerRes = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      body: JSON.stringify(playerPayload),
    }
  );

  console.log("[v0] Step 2 response status:", playerRes.status);

  if (!playerRes.ok) {
    const errorBody = await playerRes.text();
    console.log("[v0] Player API error body:", errorBody.slice(0, 500));
    throw new Error(`Innertube player API request failed (status: ${playerRes.status})`);
  }

  const playerData = await playerRes.json();
  console.log("[v0] Step 2 player data keys:", Object.keys(playerData));
  console.log("[v0] Has captions:", !!playerData?.captions);
  console.log("[v0] Has playabilityStatus:", playerData?.playabilityStatus?.status);

  if (playerData?.playabilityStatus?.status !== "OK") {
    console.log("[v0] Playability status:", JSON.stringify(playerData?.playabilityStatus));
  }

  // Step 3: Extract caption tracks
  const tracks =
    playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  console.log("[v0] Step 3 caption tracks found:", tracks?.length ?? 0);
  if (tracks) {
    console.log("[v0] Available tracks:", JSON.stringify(tracks.map((t: { languageCode: string; kind?: string; name?: { simpleText?: string }; baseUrl?: string }) => ({
      lang: t.languageCode,
      kind: t.kind,
      name: t.name?.simpleText,
      urlPrefix: t.baseUrl?.slice(0, 80),
    }))));
  } else {
    console.log("[v0] Full captions object:", JSON.stringify(playerData?.captions));
  }

  if (!tracks || tracks.length === 0) {
    throw new Error("No caption tracks found for this video");
  }

  return await fetchCaptionsFromTracks(tracks, lang);
}

async function fetchCaptionsFromTracks(
  tracks: Array<{ languageCode: string; kind?: string; baseUrl: string; name?: { simpleText?: string } }>,
  lang: string
): Promise<CaptionEntry[]> {
  // Try to find the requested language, fall back to first available
  let track = tracks.find((t) => t.languageCode === lang);
  console.log("[v0] Exact language match for", lang, ":", !!track);

  if (!track) {
    track = tracks.find((t) => t.languageCode.startsWith(lang));
    console.log("[v0] Prefix language match:", !!track);
  }
  if (!track) {
    track = tracks[0];
    console.log("[v0] Falling back to first track:", track.languageCode);
  }

  console.log("[v0] Selected track:", track.languageCode, track.kind ?? "", track.name?.simpleText ?? "");

  // Clean the base URL
  let captionUrl: string = track.baseUrl;
  captionUrl = captionUrl.replace(/&fmt=\w+/, "");
  console.log("[v0] Step 4: Fetching captions from URL:", captionUrl.slice(0, 120) + "...");

  const captionRes = await fetch(captionUrl);
  console.log("[v0] Step 4 caption response status:", captionRes.status);

  if (!captionRes.ok) {
    const errorBody = await captionRes.text();
    console.log("[v0] Caption fetch error body:", errorBody.slice(0, 500));
    throw new Error(`Failed to fetch caption data (status: ${captionRes.status})`);
  }

  const xml = await captionRes.text();
  console.log("[v0] Caption XML length:", xml.length);
  console.log("[v0] Caption XML preview:", xml.slice(0, 300));

  const entries = parseCaptionsXml(xml);
  console.log("[v0] Parsed caption entries:", entries.length);
  if (entries.length > 0) {
    console.log("[v0] First entry:", JSON.stringify(entries[0]));
    console.log("[v0] Last entry:", JSON.stringify(entries[entries.length - 1]));
  }

  return entries;
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
    console.error("[v0] Transcript fetch error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[v0] Error message:", message);
    console.error("[v0] Error stack:", stack);

    return NextResponse.json(
      {
        error:
          message.includes("No caption")
            ? "This video does not have captions/subtitles available."
            : `Could not fetch transcript: ${message}`,
        debug: { message, stack: stack?.split("\n").slice(0, 5) },
      },
      { status: 500 }
    );
  }
}
