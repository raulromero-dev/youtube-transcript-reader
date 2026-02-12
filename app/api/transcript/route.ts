import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";

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

// ─── Caption types ─────────────────────────────────────────

interface CaptionEntry {
  text: string;
  start: number;
  duration: number;
}

interface Paragraph {
  timestamp: string;
  offsetMs: number;
  text: string;
}

// ─── Paragraph grouping ───────────────────────────────────

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

// ─── Supadata API (primary) ────────────────────────────────

const SUPADATA_BASE = "https://api.supadata.ai/v1";

async function fetchViaSupadata(
  videoId: string,
  lang = "en"
): Promise<{ entries: CaptionEntry[]; language: string } | null> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    console.log("[v0] Supadata: No API key configured, skipping");
    return null;
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const headers: Record<string, string> = {
    "x-api-key": apiKey,
  };

  console.log("[v0] Supadata: Fetching transcript for", videoId);

  try {
    const res = await fetch(
      `${SUPADATA_BASE}/youtube/transcript?url=${encodeURIComponent(videoUrl)}&text=false&lang=${lang}`,
      { headers }
    );

    console.log("[v0] Supadata: Response status", res.status);

    // Immediate result
    if (res.status === 200) {
      const data = await res.json();
      return parseSupadataResponse(data, lang);
    }

    // Async job — poll for result
    if (res.status === 202) {
      const job = await res.json();
      const jobId = job?.job_id ?? job?.jobId;
      console.log("[v0] Supadata: Async job started:", jobId);

      if (!jobId) {
        console.log("[v0] Supadata: No job ID in 202 response");
        return null;
      }

      // Poll up to 30 seconds (10 attempts, 3s apart)
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((r) => setTimeout(r, 3000));
        console.log("[v0] Supadata: Polling attempt", attempt + 1);

        const pollRes = await fetch(
          `${SUPADATA_BASE}/youtube/transcript?url=${encodeURIComponent(videoUrl)}&text=false&lang=${lang}`,
          { headers }
        );

        if (pollRes.status === 200) {
          const data = await pollRes.json();
          return parseSupadataResponse(data, lang);
        }

        if (pollRes.status !== 202) {
          console.log("[v0] Supadata: Poll returned unexpected status", pollRes.status);
          return null;
        }
      }

      console.log("[v0] Supadata: Polling timed out after 30s");
      return null;
    }

    // Error response
    const errorText = await res.text();
    console.log("[v0] Supadata: Error response:", errorText.slice(0, 300));
    return null;
  } catch (e) {
    console.log("[v0] Supadata: Fetch error:", e instanceof Error ? e.message : e);
    return null;
  }
}

function parseSupadataResponse(
  data: { content?: Array<{ text: string; offset: number; duration: number; lang?: string }> },
  requestedLang: string
): { entries: CaptionEntry[]; language: string } | null {
  const content = data?.content;
  if (!Array.isArray(content) || content.length === 0) {
    console.log("[v0] Supadata: No content in response");
    return null;
  }

  console.log("[v0] Supadata: Got", content.length, "segments");

  const entries: CaptionEntry[] = content.map((item) => ({
    text: item.text,
    start: (item.offset ?? 0) / 1000,
    duration: (item.duration ?? 0) / 1000,
  }));

  const lang = content[0]?.lang ?? requestedLang;
  return { entries, language: lang };
}

// ─── YouTube Innertube fallback ────────────────────────────

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const ANDROID_UA =
  "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip";

interface CaptionTrack {
  languageCode: string;
  kind?: string;
  baseUrl: string;
}

// srv3 format
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

// Standard XML format
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

async function fetchViaYouTube(
  videoId: string,
  lang = "en"
): Promise<{ entries: CaptionEntry[]; language: string } | null> {
  console.log("[v0] YouTube fallback: Starting for", videoId);

  try {
    // Get page session
    const pageRes = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          "User-Agent": BROWSER_UA,
          "Accept-Language": "en-US,en;q=0.9",
          Cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+634",
        },
      }
    );

    if (!pageRes.ok) {
      console.log("[v0] YouTube fallback: Page fetch failed", pageRes.status);
      return null;
    }

    const html = await pageRes.text();
    const vdMatch = html.match(/"visitorData":"([^"]+)"/);
    const visitorData = vdMatch?.[1] ?? "";
    const akMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    const apiKey = akMatch?.[1] ?? "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

    // Try ANDROID Innertube
    const playerRes = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": ANDROID_UA,
          "X-YouTube-Client-Name": "3",
          "X-YouTube-Client-Version": "19.09.37",
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "ANDROID",
              clientVersion: "19.09.37",
              androidSdkVersion: 30,
              hl: "en",
              gl: "US",
              ...(visitorData ? { visitorData } : {}),
            },
          },
          videoId,
        }),
      }
    );

    if (!playerRes.ok) {
      console.log("[v0] YouTube fallback: Player API failed", playerRes.status);
      return null;
    }

    const data = await playerRes.json();
    if (data?.playabilityStatus?.status !== "OK") {
      console.log("[v0] YouTube fallback: Status", data?.playabilityStatus?.status);
      return null;
    }

    const tracks: CaptionTrack[] | undefined =
      data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!tracks || tracks.length === 0) {
      console.log("[v0] YouTube fallback: No tracks found");
      return null;
    }

    const track = pickTrack(tracks, lang);
    console.log("[v0] YouTube fallback: Using track", track.languageCode);

    const captionUrl = track.baseUrl.replace(/&fmt=\w+/, "");
    const captionRes = await fetch(captionUrl, {
      headers: { "User-Agent": ANDROID_UA },
    });

    if (!captionRes.ok) {
      console.log("[v0] YouTube fallback: Caption fetch failed", captionRes.status);
      return null;
    }

    const xml = await captionRes.text();
    if (xml.length === 0) {
      console.log("[v0] YouTube fallback: Empty caption XML");
      return null;
    }

    const entries = parseCaptions(xml);
    if (entries.length === 0) {
      console.log("[v0] YouTube fallback: Parsed 0 entries");
      return null;
    }

    console.log("[v0] YouTube fallback: Success,", entries.length, "entries");
    return { entries, language: track.languageCode };
  } catch (e) {
    console.log("[v0] YouTube fallback: Error:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ─── AI cleanup via Gemini Flash Lite ──────────────────────

async function cleanTranscriptWithAI(
  paragraphs: Paragraph[]
): Promise<Paragraph[]> {
  try {
    const rawText = paragraphs
      .map((p, i) => `[${i}] ${p.text}`)
      .join("\n");

    console.log("[v0] AI cleanup: Sending", paragraphs.length, "paragraphs to gemini-2.0-flash-lite");

    const { text } = await generateText({
      model: "google/gemini-2.0-flash-lite",
      prompt: `You are a transcript cleaner. Your ONLY job is to clean up raw YouTube transcript text.

Rules:
- Remove filler artifacts: [music], [applause], [laughter], >>>, ---, ♪, etc.
- Fix excessive spacing (multiple spaces, random line breaks mid-sentence)
- Fix obvious OCR/ASR errors when the correction is unambiguous
- Merge fragments that were clearly split mid-sentence
- Remove duplicate consecutive phrases (common ASR stutter)
- Preserve the EXACT meaning — never add, rephrase, or summarize
- Preserve all paragraph numbering [0], [1], [2], etc. exactly as given
- Return ONLY the cleaned paragraphs in the same [index] format, nothing else

Transcript:
${rawText}`,
    });

    // Parse the cleaned text back into paragraphs
    const cleaned = new Map<number, string>();
    const lineRegex = /\[(\d+)\]\s*([\s\S]*?)(?=\n\[|\n*$)/g;
    let match: RegExpExecArray | null;
    while ((match = lineRegex.exec(text)) !== null) {
      const idx = parseInt(match[1]);
      const cleanedText = match[2].trim();
      if (cleanedText) {
        cleaned.set(idx, cleanedText);
      }
    }

    console.log("[v0] AI cleanup: Parsed", cleaned.size, "cleaned paragraphs");

    if (cleaned.size < paragraphs.length * 0.5) {
      console.log("[v0] AI cleanup: Too few results, using originals");
      return paragraphs;
    }

    return paragraphs.map((p, i) => ({
      ...p,
      text: cleaned.get(i) ?? p.text,
    }));
  } catch (e) {
    console.log(
      "[v0] AI cleanup failed, using raw transcript:",
      e instanceof Error ? e.message : e
    );
    return paragraphs;
  }
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
    // Strategy 1: Supadata (reliable, handles async jobs)
    let result = await fetchViaSupadata(videoId, "en");

    // Strategy 2: Direct YouTube scraping fallback
    if (!result) {
      console.log("[v0] Supadata failed or unavailable, trying YouTube fallback");
      result = await fetchViaYouTube(videoId, "en");
    }

    if (!result || result.entries.length === 0) {
      throw new Error("No caption tracks available for this video");
    }

    const rawParagraphs = groupIntoParagraphs(result.entries);

    // Clean up via Gemma (non-blocking — falls back to raw on failure)
    const paragraphs = await cleanTranscriptWithAI(rawParagraphs);

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
      result.entries.length,
      "segments,",
      paragraphs.length,
      "paragraphs, lang:",
      result.language
    );

    return NextResponse.json({
      videoId,
      title,
      paragraphs,
      totalSegments: result.entries.length,
      language: result.language,
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
