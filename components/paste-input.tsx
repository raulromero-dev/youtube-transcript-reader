"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";

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
      className="relative flex min-h-dvh flex-col items-center justify-center px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -40, scale: 0.98 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Theme switcher in top-right */}
      <motion.div
        className="absolute right-6 top-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.5 }}
      >
        <ThemeSwitcher />
      </motion.div>

      {/* Brand mark */}
      <motion.div
        className="mb-16 flex items-center gap-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <BookOpen className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="font-serif text-2xl tracking-tight text-foreground">
          Transcript
        </span>
      </motion.div>

      {/* Main heading */}
      <motion.h1
        className="mb-4 text-center font-serif text-6xl font-medium text-foreground md:text-8xl"
        style={{ letterSpacing: "-0.035em" }}
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
        className="mb-12 max-w-lg text-center text-lg leading-relaxed text-muted-foreground"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        Transform any YouTube video into a beautifully formatted transcript.
        Like reading a book.
      </motion.p>

      {/* Input area */}
      <motion.form
        onSubmit={handleSubmit}
        className="w-full max-w-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative">
          <motion.div
            className="absolute -inset-1 rounded-2xl bg-primary/5"
            animate={{
              opacity: isFocused ? 1 : 0,
              scale: isFocused ? 1 : 0.98,
            }}
            transition={{ duration: 0.3 }}
          />
          <div className="relative flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm transition-shadow duration-300 hover:shadow-md">
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
              className="relative z-10 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/50"
              disabled={isLoading}
              aria-label="YouTube video URL"
            />
            <motion.button
              type="submit"
              disabled={!url.trim() || isLoading}
              className="relative z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors disabled:opacity-30"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              aria-label="Fetch transcript"
            >
              <ArrowRight className="h-4 w-4" />
            </motion.button>
          </div>
        </div>
      </motion.form>

      {/* Demo + hint */}
      <motion.div
        className="mt-6 flex flex-col items-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.8 }}
      >
        <button
          onClick={onDemo}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Try a demo transcript
        </button>
        <p className="text-xs text-muted-foreground/40">
          Works with any video that has captions enabled
        </p>
      </motion.div>
    </motion.div>
  );
}
