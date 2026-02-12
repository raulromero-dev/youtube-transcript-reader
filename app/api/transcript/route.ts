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

// ─── Caption types & parsers ───────────────────────────────

interface CaptionEntry {
  text: string;
  start: number;
  duration: number;
}

// srv3 format: <p t="ms" d="ms">text or <s>word</s> children</p>
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

// Standard format: <text start="s" dur="s">text</text>
function parseStandard(xml: string): CaptionEntry[] {
  const entries: CaptionEntry[] = [];
  const re =
    /<text\s+start="([^"]*)"(?:\s+dur="([^"]*)")?[^>]*>([\s\S]*?)<\/text>/g;
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

// ─── Track selection ───────────────────────────────────────

interface CaptionTrack {
  languageCode: string;
  kind?: string;
  baseUrl: string;
  name?: { simpleText?: string };
}

function pickTrack(tracks: CaptionTrack[], lang = "en"): CaptionTrack {
  return (
    tracks.find((t) => t.languageCode === lang && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode === lang) ??
    tracks.find((t) => t.languageCode.startsWith(lang) && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode.startsWith(lang)) ??
    tracks.find((t) => t.kind !== "asr") ??
    tracks[0]
  );
}

// ─── Session: fetch page, extract cookies + visitorData ────

interface PageSession {
  cookies: string;
  apiKey: string;
  visitorData: string;
  html: string;
}

async function getPageSession(videoId: string): Promise<PageSession> {
  console.log("[v0] Fetching page session for:", videoId);

  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Cookie: "CONSENT=PENDING+987",
    },
    redirect: "follow",
  });

  if (!res.ok) throw new Error(`Page fetch failed: ${res.status}`);

  const setCookies = res.headers.getSetCookie?.() ?? [];
  const cookieParts = setCookies.map((c) => c.split(";")[0]);
  cookieParts.push("CONSENT=PENDING+987");
  const cookies = cookieParts.join("; ");

  const html = await res.text();

  // Extract visitorData — YouTube embeds this in the page config
  const vdMatch =
    html.match(/"visitorData":"([^"]+)"/) ??
    html.match(/visitorData%22%3A%22([^%]+)/);
  const visitorData = vdMatch?.[1] ?? "";

  // Extract API key
  const akMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  const apiKey =
    akMatch?.[1] ?? "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

  console.log(
    "[v0] Session: cookies=",
    cookieParts.length,
    "visitorData=",
    visitorData.length > 0 ? visitorData.slice(0, 20) + "..." : "(none)",
    "apiKey=",
    apiKey.slice(0, 12) + "..."
  );

  return { cookies, apiKey, visitorData, html };
}

// ─── Strategy 1: Extract from page HTML ────────────────────

function extractTracksFromHtml(html: string): CaptionTrack[] | null {
  // Find ytInitialPlayerResponse and extract captionTracks with a targeted regex
  const tracksMatch = html.match(
    /"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*,\s*"/
  );
  if (!tracksMatch) {
    console.log("[v0] Strategy 1: No captionTracks in HTML");
    return null;
  }

  try {
    // The JSON might have unicode escapes — parse it
    const tracks = JSON.parse(tracksMatch[1]) as CaptionTrack[];
    console.log(
      "[v0] Strategy 1: Found",
      tracks.length,
      "tracks in HTML:",
      tracks.map((t) => `${t.languageCode}(${t.kind ?? "manual"})`).join(", ")
    );
    return tracks.length > 0 ? tracks : null;
  } catch (e) {
    console.log("[v0] Strategy 1: Failed to parse captionTracks JSON:", e);
    return null;
  }
}

// ─── Strategy 2: ANDROID Innertube player API ──────────────

async function fetchTracksViaInnertube(
  videoId: string,
  session: PageSession
): Promise<CaptionTrack[] | null> {
  console.log("[v0] Strategy 2: ANDROID Innertube player API");

  const body = {
    context: {
      client: {
        clientName: "ANDROID",
        clientVersion: "19.09.37",
        androidSdkVersion: 30,
        hl: "en",
        gl: "US",
        ...(session.visitorData
          ? { visitorData: session.visitorData }
          : {}),
      },
    },
    videoId,
  };

  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${session.apiKey}&prettyPrint=false`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        Cookie: session.cookies,
        "X-YouTube-Client-Name": "3",
        "X-YouTube-Client-Version": "19.09.37",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    console.log("[v0] Strategy 2: API returned", res.status);
    return null;
  }

  const data = await res.json();
  const status = data?.playabilityStatus?.status;
  console.log("[v0] Strategy 2: playability =", status);

  if (status !== "OK") {
    console.log(
      "[v0] Strategy 2: reason =",
      data?.playabilityStatus?.reason ?? "(none)"
    );
    return null;
  }

  const tracks: CaptionTrack[] | undefined =
    data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!tracks || tracks.length === 0) {
    console.log("[v0] Strategy 2: No tracks in response");
    return null;
  }

  console.log(
    "[v0] Strategy 2: Found",
    tracks.length,
    "tracks:",
    tracks.map((t) => `${t.languageCode}(${t.kind ?? "manual"})`).join(", ")
  );
  return tracks;
}

// ─── Strategy 3: WEB Innertube (different client) ──────────

async function fetchTracksViaWebInnertube(
  videoId: string,
  session: PageSession
): Promise<CaptionTrack[] | null> {
  console.log("[v0] Strategy 3: WEB Innertube player API");

  const body = {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: "2.20241120.01.00",
        hl: "en",
        gl: "US",
        ...(session.visitorData
          ? { visitorData: session.visitorData }
          : {}),
      },
    },
    videoId,
  };

  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${session.apiKey}&prettyPrint=false`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        Cookie: session.cookies,
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) return null;

  const data = await res.json();
  if (data?.playabilityStatus?.status !== "OK") {
    console.log("[v0] Strategy 3: status =", data?.playabilityStatus?.status);
    return null;
  }

  const tracks =
    data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) return null;

  console.log(
    "[v0] Strategy 3: Found",
    tracks.length,
    "tracks:",
    tracks.map((t: CaptionTrack) => `${t.languageCode}(${t.kind ?? "manual"})`).join(", ")
  );
  return tracks;
}

// ─── Fetch caption XML from a track URL ────────────────────

async function fetchCaptionXml(
  track: CaptionTrack,
  session: PageSession
): Promise<string> {
  const url = track.baseUrl.replace(/&fmt=\w+/, "");
  console.log("[v0] Fetching caption XML, lang =", track.languageCode);

  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Cookie: session.cookies,
    },
  });

  if (!res.ok) throw new Error(`Caption fetch failed: ${res.status}`);
  const xml = await res.text();
  console.log("[v0] Caption XML length:", xml.length);

  if (xml.length === 0) {
    throw new Error("Caption URL returned empty data");
  }
  return xml;
}

// ─── Main orchestrator ─────────────────────────────────────

async function fetchTranscript(
  videoId: string,
  lang = "en"
): Promise<{ entries: CaptionEntry[]; language: string }> {
  const session = await getPageSession(videoId);

  // Try strategies in order: HTML → ANDROID → WEB
  const strategies = [
    () => extractTracksFromHtml(session.html),
    () => fetchTracksViaInnertube(videoId, session),
    () => fetchTracksViaWebInnertube(videoId, session),
  ];

  for (let i = 0; i < strategies.length; i++) {
    const tracks = await strategies[i]();
    if (!tracks) continue;

    const track = pickTrack(tracks, lang);
    console.log("[v0] Using track from strategy", i + 1, ":", track.languageCode);

    try {
      const xml = await fetchCaptionXml(track, session);
      const entries = parseCaptions(xml);
      console.log("[v0] Parsed", entries.length, "entries");

      if (entries.length > 0) {
        return { entries, language: track.languageCode };
      }
      console.log("[v0] Strategy", i + 1, "returned XML but 0 parsed entries, trying next...");
    } catch (e) {
      console.log(
        "[v0] Strategy",
        i + 1,
        "caption fetch failed:",
        e instanceof Error ? e.message : e,
        "— trying next..."
      );
    }
  }

  throw new Error("No caption tracks available for this video");
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

    console.log(
      "[v0] Success:",
      entries.length,
      "segments,",
      paragraphs.length,
      "paragraphs, lang:",
      language
    );

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
