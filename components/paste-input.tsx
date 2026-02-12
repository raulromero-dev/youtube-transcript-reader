"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, BookOpen } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useTheme } from "next-themes";

interface PasteInputProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

export function PasteInput({ onSubmit, isLoading }: PasteInputProps) {
  const [url, setUrl] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [hasPasted, setHasPasted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Slow down video to 90% speed
  const handleVideoReady = useCallback((el: HTMLVideoElement | null) => {
    if (el) {
      el.playbackRate = 0.9;
      videoRef.current = el;
    }
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
      className="relative flex min-h-dvh flex-col items-center justify-center px-6 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -40, scale: 0.98 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Background video — dark mode only */}
      <AnimatePresence>
        {isDark && (
          <motion.div
            className="absolute inset-0 z-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
          >
            <video
              ref={handleVideoReady}
              autoPlay
              loop
              muted
              playsInline
              className="h-full w-full object-cover"
              src="/book-animation.mp4"
            />
            {/* Dark overlay — 80% opaque */}
            <div className="absolute inset-0 bg-background/80" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Theme switcher in top-right */}
      <motion.div
        className="absolute right-6 top-6 z-10"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.5 }}
      >
        <ThemeSwitcher />
      </motion.div>

      {/* Brand mark */}
      <motion.div
        className="relative z-10 mb-16 flex items-center gap-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="btn-physical-primary flex h-10 w-10 items-center justify-center rounded-lg">
          <BookOpen className="h-5 w-5" />
        </div>
        <span className="font-serif text-2xl tracking-tight text-foreground">
          Transcript
        </span>
      </motion.div>

      {/* Main heading */}
      <motion.h1
        className="relative z-10 mb-6 text-center font-serif font-semibold text-foreground"
        style={{ fontSize: "clamp(3.5rem, 8vw, 7rem)", lineHeight: 1.05, letterSpacing: "-0.04em" }}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="text-balance">Paste a video,</span>
        <br />
        <span className="text-balance text-muted-foreground">
          read the words
        </span>
      </motion.h1>

      <motion.p
        className="relative z-10 mb-14 max-w-lg text-center text-lg leading-relaxed text-muted-foreground md:text-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        Transform any YouTube video into a book.
      </motion.p>

      {/* Input area */}
      <motion.form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative">
          <motion.div
            className="absolute -inset-0.5 rounded-lg bg-primary/5"
            animate={{
              opacity: isFocused ? 1 : 0,
              scale: isFocused ? 1 : 0.98,
            }}
            transition={{ duration: 0.3 }}
          />
          <div className="relative flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-shadow duration-300 hover:shadow-md">
            <AnimatePresence mode="wait">
              {hasPasted && (
                <motion.div
                  className="absolute inset-0 rounded-xl bg-accent/50"
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
              className="relative z-10 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
              disabled={isLoading}
              aria-label="YouTube video URL"
            />
            <motion.button
              type="submit"
              disabled={!url.trim() || isLoading}
              className="btn-physical-primary relative z-10 flex h-7 w-7 items-center justify-center rounded-md"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              aria-label="Fetch transcript"
            >
              <ArrowRight className="h-4 w-4" />
            </motion.button>
          </div>
        </div>
      </motion.form>

      {/* Hint */}
      <motion.p
        className="relative z-10 mt-6 text-xs text-muted-foreground/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.8 }}
      >
        Works with any video that has captions enabled
      </motion.p>
    </motion.div>
  );
}
