"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

interface PasteInputProps {
  onSubmit: (url: string) => void;
  onDemo: () => void;
  isLoading: boolean;
}

export function PasteInput({ onSubmit, onDemo, isLoading }: PasteInputProps) {
  const [url, setUrl] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [hasPasted, setHasPasted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim() && !isLoading) {
      onSubmit(url.trim());
    }
  };

  const handlePaste = () => {
    setHasPasted(true);
    setTimeout(() => setHasPasted(false), 600);
  };

  return (
    <motion.div
      className="landing-bg relative flex min-h-dvh flex-col items-center justify-center px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -40, scale: 0.98 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Small uppercase tag */}
      <motion.div
        className="mb-8 flex items-center gap-2.5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-landing-border bg-landing-subtle">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-landing-fg"
          >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        </div>
        <span className="text-xs font-medium uppercase tracking-[0.15em] text-landing-muted">
          YouTube Transcript Reader
        </span>
      </motion.div>

      {/* Main heading — bold, tight, black-on-white like ElevenLabs */}
      <motion.h1
        className="mb-6 max-w-3xl text-center font-sans font-semibold text-landing-fg"
        style={{
          fontSize: "clamp(2.25rem, 5vw, 3.75rem)",
          lineHeight: 1.1,
          letterSpacing: "-0.025em",
        }}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        Paste a video, read the transcript in a beautiful format
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        className="mb-12 max-w-xl text-center text-base leading-relaxed text-landing-muted md:text-lg"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        Convert any YouTube video into a beautifully formatted, readable
        transcript. Like reading a book.
      </motion.p>

      {/* Input area */}
      <motion.form
        onSubmit={handleSubmit}
        className="w-full max-w-lg"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative">
          <motion.div
            className="absolute -inset-0.5 rounded-[11px] bg-landing-fg/[0.04]"
            animate={{
              opacity: isFocused ? 1 : 0,
              scale: isFocused ? 1 : 0.99,
            }}
            transition={{ duration: 0.25 }}
          />
          <div className="relative flex items-center gap-2 rounded-[10px] border border-landing-border bg-landing-card px-3.5 py-2 shadow-sm transition-shadow duration-300 hover:shadow-md">
            <AnimatePresence mode="wait">
              {hasPasted && (
                <motion.div
                  className="absolute inset-0 rounded-[10px] bg-landing-fg/[0.03]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                />
              )}
            </AnimatePresence>
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onPaste={handlePaste}
              placeholder="Paste a YouTube link..."
              className="relative z-10 flex-1 bg-transparent text-sm text-landing-fg outline-none placeholder:text-landing-muted/50"
              disabled={isLoading}
              aria-label="YouTube video URL"
            />
            <motion.button
              type="submit"
              disabled={!url.trim() || isLoading}
              className="relative z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-landing-fg text-landing-bg transition-colors disabled:opacity-30"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              aria-label="Fetch transcript"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </motion.button>
          </div>
        </div>
      </motion.form>

      {/* Demo + hint */}
      <motion.div
        className="mt-8 flex flex-col items-center gap-2.5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.8 }}
      >
        <button
          onClick={onDemo}
          className="flex items-center gap-1.5 text-sm text-landing-muted transition-colors hover:text-landing-fg"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Try a demo transcript
        </button>
        <p className="text-xs text-landing-muted/50">
          Works with any video that has captions enabled
        </p>
      </motion.div>
    </motion.div>
  );
}
