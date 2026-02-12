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
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  return null;
}

function formatTimestamp(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/\n/g, " ");
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ─── Caption entry ─────────────────────────────────────────

interface CaptionEntry {
  text: string;
  start: number;
  duration: number;
}

// Parse srv3 XML:  <p t="ms" d="ms">text or <s>word</s> children</p>
function parseSrv3(xml: string): CaptionEntry[] {
  const entries: CaptionEntry[] = [];
  const re = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const text = decodeEntities(m[3].replace(/<[^>]+>/g, "").trim());
    if (text) {
      entries.push({
        text,
        start: parseInt(m[1]) / 1000,
        duration: parseInt(m[2]) / 1000,
      });
    }
  }
  return entries;
}

// Parse standard XML:  <text start="s" dur="s">text</text>
function parseStandard(xml: string): CaptionEntry[] {
  const entries: CaptionEntry[] = [];
  const re = /<text\s+start="([^"]*)"(?:\s+dur="([^"]*)")?[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const text = decodeEntities(m[3].replace(/<[^>]+>/g, "").trim());
    if (text) {
      entries.push({
        text,
        start: parseFloat(m[1]),
        duration: parseFloat(m[2] || "0"),
      });
    }
  }
  return entries;
}

function parseCaptions(data: string): CaptionEntry[] {
  if (data.includes("<p t=")) {
    const r = parseSrv3(data);
    if (r.length > 0) return r;
  }
  return parseStandard(data);
}

// ─── Paragraph grouping ───────────────────────────────────

interface Paragraph {
  timestamp: string;
  offsetMs: number;
  text: string;
}

function groupIntoParagraphs(segments: CaptionEntry[]): Paragraph[] {
  const out: Paragraph[] = [];
  let buf = "";
  let ts = "";
  let off = 0;
  let sc = 0;

  for (const seg of segments) {
    if (!ts) {
      ts = formatTimestamp(seg.start);
      off = Math.floor(seg.start * 1000);
    }
    buf += (buf ? " " : "") + seg.text.trim();
    sc += (seg.text.match(/[.!?]+/g) || []).length;

    if (sc >= 3 || buf.length > 400) {
      out.push({ timestamp: ts, offsetMs: off, text: buf.trim() });
      buf = "";
      ts = "";
      off = 0;
      sc = 0;
    }
  }
  if (buf.trim()) out.push({ timestamp: ts, offsetMs: off, text: buf.trim() });
  return out;
}

// ─── Core fetch ────────────────────────────────────────────
//
// Strategy: ANDROID Innertube client.
//
// Why ANDROID? The WEB client's caption URLs have ip=0.0.0.0 and
// return 200 with empty body from server-side. ANDROID returns fresh
// signed URLs that actually deliver data.
//
// We also collect session cookies from the initial page fetch
// to avoid bot-detection blocks.

interface CaptionTrack {
  languageCode: string;
  kind?: string;
  baseUrl: string;
  name?: { simpleText?: string };
}

async function fetchTranscript(
  videoId: string,
  lang = "en"
): Promise<{ entries: CaptionEntry[]; language: string }> {
  console.log("[v0] Fetching transcript for:", videoId);

  // 1. Fetch page to collect session cookies
  const pageRes = await fetch(
    `https://www.youtube.com/watch?v=${videoId}`,
    {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: "CONSENT=YES+1",
      },
    }
  );
  if (!pageRes.ok) throw new Error(`Page fetch failed: ${pageRes.status}`);

  const setCookies = pageRes.headers.getSetCookie?.() ?? [];
  const cookies = ["CONSENT=YES+1", ...setCookies.map((c) => c.split(";")[0])];
  const cookieStr = cookies.join("; ");
  const html = await pageRes.text();

  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  const apiKey =
    apiKeyMatch?.[1] || "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

  console.log("[v0] Page fetched, cookies:", cookies.length, "API key found:", !!apiKeyMatch);

  // 2. ANDROID Innertube player
  const playerRes = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
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
    console.log("[v0] ANDROID player API status:", playerRes.status);
    throw new Error("YouTube API request failed");
  }

  const player = await playerRes.json();
  const status = player?.playabilityStatus?.status;
  console.log("[v0] Playability:", status);

  if (status !== "OK") {
    throw new Error(
      player?.playabilityStatus?.reason || "Video is not playable"
    );
  }

  const tracks: CaptionTrack[] | undefined =
    player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!tracks || tracks.length === 0) {
    throw new Error("No caption tracks available for this video");
  }

  console.log(
    "[v0] Tracks:",
    tracks.map((t) => `${t.languageCode}(${t.kind || "manual"})`).join(", ")
  );

  // 3. Pick the best track
  let track =
    tracks.find((t) => t.languageCode === lang && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode === lang) ??
    tracks.find((t) => t.languageCode.startsWith(lang) && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode.startsWith(lang));

  // If no English, pick first manual, then first ASR
  if (!track) {
    track =
      tracks.find((t) => t.kind !== "asr") ?? tracks[0];
  }

  const chosenLang = track.languageCode;
  console.log("[v0] Selected track:", chosenLang, track.kind || "manual");

  // 4. Fetch caption data
  const captionRes = await fetch(track.baseUrl, {
    headers: { "User-Agent": UA, Cookie: cookieStr },
  });
  if (!captionRes.ok) {
    throw new Error(`Caption fetch failed: ${captionRes.status}`);
  }

  const xml = await captionRes.text();
  console.log("[v0] Caption data length:", xml.length);

  if (xml.length === 0) {
    throw new Error("Caption URL returned empty data");
  }

  const entries = parseCaptions(xml);
  console.log("[v0] Parsed entries:", entries.length);

  if (entries.length === 0) {
    throw new Error("Could not parse caption data");
  }

  return { entries, language: chosenLang };
}

// ─── Route handler ─────────────────────────────────────────

export async function GET(request: NextRequest) {
  const url = new URL(request.url).searchParams.get("url");

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
    const { entries, language } = await fetchTranscript(videoId, "en");
    const paragraphs = groupIntoParagraphs(entries);

    // Title via oEmbed
    let title = "Untitled Video";
    try {
      const r = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
      );
      if (r.ok) {
        const j = await r.json();
        title = j.title || title;
      }
    } catch {
      /* ignore */
    }

    console.log("[v0] Done:", entries.length, "segments,", paragraphs.length, "paragraphs, lang:", language);

    return NextResponse.json({
      videoId,
      title,
      paragraphs,
      totalSegments: entries.length,
      language,
    });
  } catch (error) {
    console.error("[v0] Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: msg.includes("No caption")
          ? "This video does not have captions or subtitles available."
          : `Could not fetch transcript. ${msg}`,
      },
      { status: 500 }
    );
  }
}
