"use client";

import { useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { PasteInput } from "@/components/paste-input";
import { LoadingState } from "@/components/loading-state";
import { TranscriptReader } from "@/components/transcript-reader";
import { ErrorState } from "@/components/error-state";
import { DEMO_TRANSCRIPT } from "@/lib/demo-transcript";

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
  const [transcriptData, setTranscriptData] = useState<TranscriptData | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState("");

  const fetchTranscript = useCallback(async (url: string) => {
    setState("loading");
    setErrorMessage("");

    try {
      const res = await fetch(
        `/api/transcript?url=${encodeURIComponent(url)}`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch transcript");
      }

      await new Promise((resolve) => setTimeout(resolve, 800));

      setTranscriptData(data);
      setState("reading");
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
      setState("error");
    }
  }, []);

  const loadDemo = useCallback(() => {
    setState("loading");
    setTimeout(() => {
      setTranscriptData(DEMO_TRANSCRIPT);
      setState("reading");
    }, 1200);
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
            onDemo={loadDemo}
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
