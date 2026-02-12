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

/**
 * Parse standard timedtext XML (<text start="" dur="">)
 */
function parseStandardXml(xml: string): CaptionEntry[] {
  const entries: CaptionEntry[] = [];
  const regex =
    /<text start="([^"]*)" dur="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const start = parseFloat(match[1]);
    const dur = parseFloat(match[2]);
    const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, "").trim());
    if (text) {
      entries.push({ text, start, duration: dur });
    }
  }
  return entries;
}

/**
 * Parse srv3 XML format (<p t="ms" d="ms"> with <s> sub-elements)
 * This is what the ANDROID client returns.
 */
function parseSrv3Xml(xml: string): CaptionEntry[] {
  const entries: CaptionEntry[] = [];
  const regex = /<p t="(\d+)" d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const tMs = parseInt(match[1]);
    const dMs = parseInt(match[2]);
    // Strip inner <s> tags to get plain text
    const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, "").trim());
    if (text) {
      entries.push({ text, start: tMs / 1000, duration: dMs / 1000 });
    }
  }
  return entries;
}

/**
 * Parse json3 format (events with segs arrays)
 */
function parseJson3(jsonText: string): CaptionEntry[] {
  const entries: CaptionEntry[] = [];
  try {
    const data = JSON.parse(jsonText);
    const events = (data.events || []).filter(
      (e: { segs?: unknown }) => e.segs
    );
    for (const event of events) {
      const text = event.segs
        .map((s: { utf8?: string }) => s.utf8 || "")
        .join("")
        .trim();
      if (text && text !== "\n") {
        entries.push({
          text,
          start: (event.tStartMs || 0) / 1000,
          duration: (event.dDurationMs || 0) / 1000,
        });
      }
    }
  } catch {
    // Not JSON
  }
  return entries;
}

/**
 * Auto-detect format and parse caption data
 */
function parseCaptions(data: string): CaptionEntry[] {
  // Try json3 first
  if (data.trim().startsWith("{")) {
    const entries = parseJson3(data);
    if (entries.length > 0) return entries;
  }

  // Try srv3 format (<p t="" d="">)
  if (data.includes("<p t=")) {
    const entries = parseSrv3Xml(data);
    if (entries.length > 0) return entries;
  }

  // Try standard XML (<text start="" dur="">)
  return parseStandardXml(data);
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
 * Extract a JSON object from a string using brace counting.
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

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ─── Core: Session-based approach ──────────────────────────
//
// 1. Fetch the YouTube page to get session cookies + API key
// 2. Use ANDROID Innertube client (with session cookies) to get fresh caption URLs
// 3. Fetch caption data from those URLs
//
// The WEB client's caption URLs return empty bodies from server-side.
// The ANDROID client returns caption URLs that actually work.

async function fetchTranscript(
  videoId: string,
  lang = "en"
): Promise<CaptionEntry[]> {
  console.log("[v0] Starting transcript fetch for:", videoId);

  // Step 1: Fetch YouTube page to get session cookies + API key
  const pageRes = await fetch(
    `https://www.youtube.com/watch?v=${videoId}`,
    {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: "CONSENT=YES+1",
      },
    }
  );

  if (!pageRes.ok) {
    throw new Error(`Page fetch failed: ${pageRes.status}`);
  }

  // Collect session cookies
  const setCookies = pageRes.headers.getSetCookie
    ? pageRes.headers.getSetCookie()
    : [];
  const cookieParts = ["CONSENT=YES+1"];
  for (const sc of setCookies) {
    cookieParts.push(sc.split(";")[0]);
  }
  const cookieStr = cookieParts.join("; ");

  const html = await pageRes.text();
  console.log("[v0] Page fetched. HTML length:", html.length);

  // Extract API key
  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  const apiKey = apiKeyMatch?.[1] || "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

  // Step 2: Use ANDROID client to get working caption URLs
  console.log("[v0] Calling ANDROID Innertube player...");
  const playerRes = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        Cookie: cookieStr,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "19.09.37",
            androidSdkVersion: 30,
            hl: "en",
            gl: "US",
          },
        },
        videoId,
      }),
    }
  );

  if (!playerRes.ok) {
    console.log("[v0] ANDROID player API failed:", playerRes.status);
    // Fallback: try to get tracks from page HTML
    return await fallbackFromPageHtml(html, cookieStr, lang);
  }

  const playerData = await playerRes.json();
  console.log("[v0] ANDROID status:", playerData?.playabilityStatus?.status);

  const tracks =
    playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!tracks || tracks.length === 0) {
    console.log("[v0] No tracks from ANDROID client. Reason:", playerData?.playabilityStatus?.reason);
    // Fallback: try page HTML approach
    return await fallbackFromPageHtml(html, cookieStr, lang);
  }

  console.log("[v0] Found", tracks.length, "tracks from ANDROID client");

  // Select track by language
  let track = tracks.find(
    (t: { languageCode: string }) => t.languageCode === lang
  );
  if (!track) {
    track = tracks.find((t: { languageCode: string }) =>
      t.languageCode.startsWith(lang)
    );
  }
  if (!track) {
    track = tracks[0];
  }

  console.log("[v0] Selected track:", track.languageCode, track.kind || "manual");

  // Step 3: Fetch caption data
  // Try json3 format first, then raw
  const formats = ["&fmt=json3", ""];
  for (const fmt of formats) {
    const captionUrl = track.baseUrl + fmt;
    console.log("[v0] Fetching captions with format:", fmt || "default");

    const captionRes = await fetch(captionUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: cookieStr,
      },
    });

    if (!captionRes.ok) continue;

    const captionData = await captionRes.text();
    console.log("[v0] Caption data length:", captionData.length);

    if (captionData.length > 0) {
      const entries = parseCaptions(captionData);
      console.log("[v0] Parsed entries:", entries.length);
      if (entries.length > 0) return entries;
    }
  }

  throw new Error("Caption URLs returned empty data");
}

/**
 * Fallback: Extract caption tracks from embedded ytInitialPlayerResponse
 * in the page HTML, and try to fetch them.
 */
async function fallbackFromPageHtml(
  html: string,
  cookieStr: string,
  lang: string
): Promise<CaptionEntry[]> {
  console.log("[v0] Fallback: trying page HTML embedded data...");

  const marker = "var ytInitialPlayerResponse = ";
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error("No player response found in page HTML");
  }

  const jsonStart = markerIdx + marker.length;
  const jsonStr = extractJsonObject(html, jsonStart);
  if (!jsonStr) {
    throw new Error("Could not extract player response JSON");
  }

  const playerData = JSON.parse(jsonStr);
  const tracks =
    playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!tracks || tracks.length === 0) {
    throw new Error("No caption tracks available for this video");
  }

  console.log("[v0] Found", tracks.length, "tracks in page HTML");

  // Select track
  let track = tracks.find(
    (t: { languageCode: string }) => t.languageCode === lang
  );
  if (!track) {
    track = tracks.find((t: { languageCode: string }) =>
      t.languageCode.startsWith(lang)
    );
  }
  if (!track) track = tracks[0];

  // Try fetching with cookies
  const formats = ["&fmt=json3", ""];
  for (const fmt of formats) {
    try {
      const captionRes = await fetch(track.baseUrl + fmt, {
        headers: {
          "User-Agent": USER_AGENT,
          Cookie: cookieStr,
        },
      });

      if (!captionRes.ok) continue;
      const captionData = await captionRes.text();
      if (captionData.length > 0) {
        const entries = parseCaptions(captionData);
        if (entries.length > 0) return entries;
      }
    } catch {
      continue;
    }
  }

  throw new Error("No caption tracks could be fetched for this video");
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

  console.log("[v0] ═══ Transcript request for:", videoId, "═══");

  try {
    const segments = await fetchTranscript(videoId, "en");
    const paragraphs = groupIntoParagraphs(segments);

    // Fetch title via oEmbed
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

    console.log("[v0] Success! Segments:", segments.length, "Paragraphs:", paragraphs.length);

    return NextResponse.json({
      videoId,
      title,
      paragraphs,
      totalSegments: segments.length,
    });
  } catch (error) {
    console.error("[v0] Error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      {
        error: message.includes("No caption")
          ? "This video does not have captions/subtitles available."
          : `Could not fetch transcript. ${message}`,
      },
      { status: 500 }
    );
  }
}
