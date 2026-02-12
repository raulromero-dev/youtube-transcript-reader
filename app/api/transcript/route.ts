import { NextRequest, NextResponse } from "next/server";

// ─── Helpers ───────────────────────────────────────────────

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
    if (sentences) sentenceCount += sentences.length;

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

/**
 * Extract a JSON object from a string starting at `startIndex`.
 * Uses brace counting so we get the full object, not a truncated one.
 */
function extractJsonObject(str: string, startIndex: number): string | null {
  if (str[startIndex] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < str.length; i++) {
    const ch = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return str.substring(startIndex, i + 1);
      }
    }
  }
  return null;
}

const YT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

// ─── Strategy 1: Scrape ytInitialPlayerResponse from page HTML ─────

async function strategyEmbeddedPlayerResponse(
  videoId: string,
  lang: string
): Promise<CaptionEntry[] | null> {
  console.log("[v0] Strategy 1: Extracting captions from page HTML");
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const res = await fetch(videoUrl, {
    headers: {
      ...YT_HEADERS,
      Cookie: "CONSENT=YES+1",
    },
  });
  console.log("[v0] S1: Page fetch status:", res.status);
  if (!res.ok) return null;

  const html = await res.text();
  console.log("[v0] S1: HTML length:", html.length);

  // Check if we got a consent page
  if (html.includes("consent.youtube.com") || html.includes("CONSENT")) {
    console.log("[v0] S1: Detected consent redirect in HTML");
  }

  // --- Try ytInitialPlayerResponse ---
  const marker = "var ytInitialPlayerResponse = ";
  const markerIdx = html.indexOf(marker);
  console.log("[v0] S1: ytInitialPlayerResponse marker index:", markerIdx);

  if (markerIdx !== -1) {
    const jsonStart = markerIdx + marker.length;
    const jsonStr = extractJsonObject(html, jsonStart);
    console.log("[v0] S1: Extracted JSON length:", jsonStr?.length ?? 0);

    if (jsonStr) {
      try {
        const playerData = JSON.parse(jsonStr);
        console.log("[v0] S1: Parsed player data. Keys:", Object.keys(playerData).join(", "));
        console.log("[v0] S1: playabilityStatus:", playerData?.playabilityStatus?.status);
        console.log("[v0] S1: Has captions:", !!playerData?.captions);

        const tracks =
          playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        console.log("[v0] S1: Caption tracks count:", tracks?.length ?? 0);

        if (tracks?.length) {
          console.log(
            "[v0] S1: Tracks:",
            JSON.stringify(
              tracks.map(
                (t: { languageCode: string; kind?: string; name?: { simpleText?: string } }) => ({
                  lang: t.languageCode,
                  kind: t.kind,
                  name: t.name?.simpleText,
                })
              )
            )
          );
          return await fetchCaptionXml(tracks, lang);
        }
      } catch (e) {
        console.log("[v0] S1: JSON parse error:", (e as Error).message);
      }
    }
  }

  // --- Fallback: try finding captions in ytInitialData ---
  const dataMarker = "var ytInitialData = ";
  const dataIdx = html.indexOf(dataMarker);
  console.log("[v0] S1: ytInitialData marker index:", dataIdx);

  // --- Fallback: try finding captionTracks anywhere in the HTML ---
  const captionTracksMatch = html.match(/"captionTracks"\s*:\s*\[/);
  console.log("[v0] S1: Found captionTracks pattern in HTML:", !!captionTracksMatch);

  if (captionTracksMatch && captionTracksMatch.index !== undefined) {
    // Walk backwards to find the enclosing object for captions
    const arrayStart = captionTracksMatch.index + '"captionTracks":'.length;
    // Extract the array
    let depth = 0;
    let arrayEnd = arrayStart;
    for (let i = arrayStart; i < html.length; i++) {
      if (html[i] === "[") depth++;
      else if (html[i] === "]") {
        depth--;
        if (depth === 0) {
          arrayEnd = i + 1;
          break;
        }
      }
    }
    const arrayStr = html.substring(arrayStart, arrayEnd);
    console.log("[v0] S1: captionTracks array length:", arrayStr.length);
    try {
      const tracks = JSON.parse(arrayStr);
      console.log("[v0] S1: Parsed captionTracks from HTML. Count:", tracks.length);
      if (tracks.length > 0) {
        return await fetchCaptionXml(tracks, lang);
      }
    } catch (e) {
      console.log("[v0] S1: Failed to parse captionTracks array:", (e as Error).message);
    }
  }

  console.log("[v0] S1: No captions found in HTML");
  return null;
}

// ─── Strategy 2: Direct timedtext API ───────────────────────

async function strategyTimedText(
  videoId: string,
  lang: string
): Promise<CaptionEntry[] | null> {
  console.log("[v0] Strategy 2: Trying direct timedtext API");

  // Try auto-generated captions first (kind=asr), then manual
  const urls = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&kind=asr`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=srv3`,
  ];

  for (const url of urls) {
    console.log("[v0] S2: Trying URL:", url);
    try {
      const res = await fetch(url, { headers: YT_HEADERS });
      console.log("[v0] S2: Status:", res.status, "Content-Type:", res.headers.get("content-type"));

      if (!res.ok) {
        console.log("[v0] S2: Non-OK status, skipping");
        continue;
      }

      const text = await res.text();
      console.log("[v0] S2: Response length:", text.length, "Preview:", text.slice(0, 200));

      if (text.length < 50) {
        console.log("[v0] S2: Response too short, likely empty, skipping");
        continue;
      }

      const entries = parseCaptionsXml(text);
      console.log("[v0] S2: Parsed entries:", entries.length);

      if (entries.length > 0) {
        return entries;
      }
    } catch (e) {
      console.log("[v0] S2: Error:", (e as Error).message);
    }
  }

  console.log("[v0] S2: No captions from timedtext API");
  return null;
}

// ─── Strategy 3: Innertube player API ──────────────────────

async function strategyInnertube(
  videoId: string,
  lang: string
): Promise<CaptionEntry[] | null> {
  console.log("[v0] Strategy 3: Innertube player API");

  // We use the WEB client with a known API key
  const apiKeys = ["AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8", "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc"];

  for (const apiKey of apiKeys) {
    console.log("[v0] S3: Trying with API key:", apiKey.slice(0, 12) + "...");

    try {
      const payload = {
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

      const res = await fetch(
        `https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...YT_HEADERS,
          },
          body: JSON.stringify(payload),
        }
      );

      console.log("[v0] S3: Player API status:", res.status);
      if (!res.ok) {
        console.log("[v0] S3: Non-OK, skipping key");
        continue;
      }

      const data = await res.json();
      console.log("[v0] S3: Response keys:", Object.keys(data).join(", "));
      console.log("[v0] S3: playabilityStatus:", data?.playabilityStatus?.status);
      console.log("[v0] S3: Has captions:", !!data?.captions);

      const tracks =
        data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      console.log("[v0] S3: Tracks count:", tracks?.length ?? 0);

      if (tracks?.length) {
        console.log(
          "[v0] S3: Available tracks:",
          JSON.stringify(
            tracks.map(
              (t: { languageCode: string; kind?: string }) => ({
                lang: t.languageCode,
                kind: t.kind,
              })
            )
          )
        );
        return await fetchCaptionXml(tracks, lang);
      }

      // If no tracks, log why
      if (data?.captions) {
        console.log("[v0] S3: Full captions object:", JSON.stringify(data.captions).slice(0, 500));
      }
    } catch (e) {
      console.log("[v0] S3: Error with key:", (e as Error).message);
    }
  }

  console.log("[v0] S3: No captions from Innertube API");
  return null;
}

// ─── Shared: fetch captions XML from a track list ──────────

async function fetchCaptionXml(
  tracks: Array<{
    languageCode: string;
    kind?: string;
    baseUrl: string;
    name?: { simpleText?: string };
  }>,
  lang: string
): Promise<CaptionEntry[]> {
  let track = tracks.find((t) => t.languageCode === lang);
  if (!track) track = tracks.find((t) => t.languageCode.startsWith(lang));
  if (!track) track = tracks[0];

  console.log("[v0] fetchCaptionXml: Using track:", track.languageCode, track.kind ?? "manual");

  let url: string = track.baseUrl;
  url = url.replace(/&fmt=\w+/, "");
  console.log("[v0] fetchCaptionXml: URL:", url.slice(0, 150));

  const res = await fetch(url);
  console.log("[v0] fetchCaptionXml: Status:", res.status);
  if (!res.ok) throw new Error(`Caption XML fetch failed: ${res.status}`);

  const xml = await res.text();
  console.log("[v0] fetchCaptionXml: XML length:", xml.length, "Preview:", xml.slice(0, 200));

  const entries = parseCaptionsXml(xml);
  console.log("[v0] fetchCaptionXml: Parsed entries:", entries.length);

  return entries;
}

// ─── Route handler ─────────────────────────────────────────

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

  console.log("[v0] ============================================");
  console.log("[v0] Transcript request for videoId:", videoId);
  console.log("[v0] ============================================");

  try {
    let segments: CaptionEntry[] | null = null;

    // Strategy 1: Extract from embedded HTML
    segments = await strategyEmbeddedPlayerResponse(videoId, "en");

    // Strategy 2: Direct timedtext API
    if (!segments || segments.length === 0) {
      segments = await strategyTimedText(videoId, "en");
    }

    // Strategy 3: Innertube player API
    if (!segments || segments.length === 0) {
      segments = await strategyInnertube(videoId, "en");
    }

    if (!segments || segments.length === 0) {
      console.log("[v0] All strategies exhausted. No captions found.");
      return NextResponse.json(
        { error: "This video does not have captions/subtitles available." },
        { status: 404 }
      );
    }

    console.log("[v0] Success! Total caption entries:", segments.length);
    const paragraphs = groupIntoParagraphs(segments);

    // Fetch title
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
      // ignore
    }

    return NextResponse.json({
      videoId,
      title,
      paragraphs,
      totalSegments: segments.length,
    });
  } catch (error) {
    console.error("[v0] Top-level error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[v0] Error message:", message);

    return NextResponse.json(
      {
        error: `Could not fetch transcript: ${message}`,
        debug: {
          message,
          stack: error instanceof Error
            ? error.stack?.split("\n").slice(0, 5)
            : undefined,
        },
      },
      { status: 500 }
    );
  }
}
