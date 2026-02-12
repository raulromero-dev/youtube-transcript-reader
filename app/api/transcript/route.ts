import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";

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

function formatTimestamp(offsetMs: number): string {
  const totalSeconds = Math.floor(offsetMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
}

function groupIntoParagraphs(segments: TranscriptSegment[]) {
  const paragraphs: { timestamp: string; offsetMs: number; text: string }[] =
    [];
  let currentText = "";
  let currentTimestamp = "";
  let currentOffsetMs = 0;
  let sentenceCount = 0;

  for (const segment of segments) {
    if (!currentTimestamp) {
      currentTimestamp = formatTimestamp(segment.offset);
      currentOffsetMs = segment.offset;
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
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);

    if (!transcript || transcript.length === 0) {
      return NextResponse.json(
        { error: "No transcript available for this video" },
        { status: 404 }
      );
    }

    const paragraphs = groupIntoParagraphs(
      transcript as TranscriptSegment[]
    );

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
      totalSegments: transcript.length,
    });
  } catch (error) {
    console.error("Transcript fetch error:", error);
    return NextResponse.json(
      {
        error:
          "Could not fetch transcript. The video may not have captions enabled.",
      },
      { status: 500 }
    );
  }
}
