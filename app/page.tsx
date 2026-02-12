"use client";

import { useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
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
}

export default function Home() {
  const [state, setState] = useState<AppState>("input");
  const [transcriptData, setTranscriptData] = useState<TranscriptData | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState("");

  const fetchTranscript = useCallback(async (url: string) => {
    setState("loading");
    setErrorMessage("");

    try {
      console.log("[v0] Fetching transcript for URL:", url);
      const res = await fetch(
        `/api/transcript?url=${encodeURIComponent(url)}`
      );
      console.log("[v0] Response status:", res.status);
      const data = await res.json();
      console.log("[v0] Response data:", JSON.stringify(data).slice(0, 500));

      if (!res.ok) {
        console.log("[v0] Error response - full data:", JSON.stringify(data));
        throw new Error(data.error || "Failed to fetch transcript");
      }

      console.log("[v0] Success! Paragraphs:", data.paragraphs?.length, "Title:", data.title);

      // Small delay to let the loading animation feel intentional
      await new Promise((resolve) => setTimeout(resolve, 800));

      setTranscriptData(data);
      setState("reading");
    } catch (err) {
      console.error("[v0] Catch block error:", err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
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
      <AnimatePresence mode="wait">
        {state === "input" && (
          <PasteInput
            key="input"
            onSubmit={fetchTranscript}
            isLoading={false}
          />
        )}

        {state === "loading" && <LoadingState key="loading" />}

        {state === "reading" && transcriptData && (
          <TranscriptReader
            key="reading"
            data={transcriptData}
            onBack={goBack}
          />
        )}

        {state === "error" && (
          <ErrorState
            key="error"
            message={errorMessage}
            onBack={goBack}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
