"use client";

import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { PasteInput } from "@/components/paste-input";
import { LoadingState } from "@/components/loading-state";
import { TranscriptReader } from "@/components/transcript-reader";
import { ErrorState } from "@/components/error-state";

type AppState = "input" | "loading" | "reading" | "error";

interface TranscriptData {
  videoId: string;
  title: string;
  paragraphs: {
    timestamp: string;
    offsetMs: number;
    text: string;
  }[];
  totalSegments: number;
  language?: string;
}

export default function Home() {
  const [state, setState] = useState<AppState>("input");
  const [rendered, setRendered] = useState<AppState>("input");
  const [transcriptData, setTranscriptData] = useState<TranscriptData | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState("");

  // Two-phase transition: fade out current, then swap and fade in next
  useEffect(() => {
    if (state !== rendered) {
      // Short delay to let current view fade out, then swap
      const timer = setTimeout(() => {
        setRendered(state);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [state, rendered]);

  const isVisible = state === rendered;

  const fetchTranscript = useCallback(async (url: string) => {
    console.log("[v0] State transition: input -> loading");
    setState("loading");
    setErrorMessage("");

    try {
      console.log("[v0] Fetching transcript for:", url);
      const res = await fetch(
        `/api/transcript?url=${encodeURIComponent(url)}`
      );
      console.log("[v0] Fetch response status:", res.status);
      const data = await res.json();
      console.log("[v0] Fetch response data keys:", Object.keys(data));

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch transcript");
      }

      console.log("[v0] Transcript received, paragraphs:", data.paragraphs?.length);

      await new Promise((resolve) => setTimeout(resolve, 800));

      setTranscriptData(data);
      console.log("[v0] State transition: loading -> reading");
      setState("reading");
    } catch (err) {
      console.log("[v0] Fetch error:", err instanceof Error ? err.message : err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
      console.log("[v0] State transition: loading -> error");
      setState("error");
    }
  }, []);

  const goBack = useCallback(() => {
    setState("input");
    setTranscriptData(null);
    setErrorMessage("");
  }, []);

  return (
    <main className="min-h-dvh">
      <motion.div
        animate={{ opacity: isVisible ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        className="min-h-dvh"
      >
        {rendered === "input" && (
          <PasteInput
            onSubmit={fetchTranscript}
            isLoading={false}
          />
        )}

        {rendered === "loading" && <LoadingState />}

        {rendered === "reading" && transcriptData && (
          <TranscriptReader
            data={transcriptData}
            onBack={goBack}
          />
        )}

        {rendered === "error" && (
          <ErrorState
            message={errorMessage}
            onBack={goBack}
          />
        )}
      </motion.div>
    </main>
  );
}
