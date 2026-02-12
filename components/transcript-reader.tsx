"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Clock,
  Copy,
  Check,
  Type,
  Scroll,
  BookOpenCheck,
  Globe,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";

interface Paragraph {
  timestamp: string;
  offsetMs: number;
  text: string;
}

interface TranscriptData {
  videoId: string;
  title: string;
  paragraphs: Paragraph[];
  totalSegments: number;
  language?: string;
}

interface TranscriptReaderProps {
  data: TranscriptData;
  onBack: () => void;
}

const PARAGRAPHS_PER_PAGE = 4;

/* ------------------------------------------------------------------ */
/*  Animated word component — blur + rise reveal                      */
/* ------------------------------------------------------------------ */
function AnimatedWord({
  word,
  index,
  paragraphDelay,
}: {
  word: string;
  index: number;
  paragraphDelay: number;
}) {
  const delay = paragraphDelay + index * 0.035;

  return (
    <motion.span
      className="inline-block"
      initial={{ opacity: 0, filter: "blur(8px)", y: 6 }}
      animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
      transition={{
        delay,
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {word}&nbsp;
    </motion.span>
  );
}

/* ------------------------------------------------------------------ */
/*  Paragraph with staggered word reveal                              */
/* ------------------------------------------------------------------ */
function RevealParagraph({
  paragraph,
  paragraphIndex,
  showTimestamps,
  fontSizeClass,
  isFirstReveal,
}: {
  paragraph: Paragraph;
  paragraphIndex: number;
  showTimestamps: boolean;
  fontSizeClass: string;
  isFirstReveal: boolean;
}) {
  const words = useMemo(() => paragraph.text.split(/\s+/), [paragraph.text]);
  const paragraphDelay = isFirstReveal ? 0.3 + paragraphIndex * 0.4 : 0.05 + paragraphIndex * 0.06;

  if (!isFirstReveal) {
    // After first reveal, use simpler slide-in per paragraph
    return (
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0.05 + paragraphIndex * 0.08,
          duration: 0.4,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        {showTimestamps && (
          <span className="mb-2 inline-block font-sans text-xs uppercase tracking-widest text-muted-foreground/60">
            {paragraph.timestamp}
          </span>
        )}
        <p className={`font-sans leading-relaxed text-foreground ${fontSizeClass}`}>
          {paragraph.text}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: paragraphDelay - 0.1, duration: 0.2 }}
    >
      {showTimestamps && (
        <motion.span
          className="mb-2 inline-block font-sans text-xs uppercase tracking-widest text-muted-foreground/60"
          initial={{ opacity: 0, filter: "blur(4px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ delay: paragraphDelay - 0.05, duration: 0.4 }}
        >
          {paragraph.timestamp}
        </motion.span>
      )}
      <p className={`font-sans leading-relaxed text-foreground ${fontSizeClass}`}>
        {words.map((word, wi) => (
          <AnimatedWord
            key={`${paragraphIndex}-${wi}`}
            word={word}
            index={wi}
            paragraphDelay={paragraphDelay}
          />
        ))}
      </p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main reader                                                       */
/* ------------------------------------------------------------------ */
export function TranscriptReader({ data, onBack }: TranscriptReaderProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [direction, setDirection] = useState(0);
  const [fontSize, setFontSize] = useState(1);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [viewMode, setViewMode] = useState<"paged" | "scroll">("paged");
  const [isFirstReveal, setIsFirstReveal] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);

  const totalPages = Math.ceil(data.paragraphs.length / PARAGRAPHS_PER_PAGE);

  const currentParagraphs = data.paragraphs.slice(
    currentPage * PARAGRAPHS_PER_PAGE,
    (currentPage + 1) * PARAGRAPHS_PER_PAGE
  );

  // After the first page reveal completes, disable the fancy word animation
  useEffect(() => {
    if (isFirstReveal) {
      const maxWords = currentParagraphs.reduce(
        (acc, p) => acc + p.text.split(/\s+/).length,
        0
      );
      const totalDuration =
        (0.3 + (currentParagraphs.length - 1) * 0.4 + maxWords * 0.035 + 0.5) * 1000;
      const timer = setTimeout(() => setIsFirstReveal(false), totalDuration);
      return () => clearTimeout(timer);
    }
  }, [isFirstReveal, currentParagraphs]);

  const goToPage = useCallback(
    (page: number) => {
      if (page < 0 || page >= totalPages) return;
      setDirection(page > currentPage ? 1 : -1);
      setCurrentPage(page);
    },
    [currentPage, totalPages]
  );

  const nextPage = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage]);
  const prevPage = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        nextPage();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevPage();
      } else if (e.key === "Escape") {
        onBack();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextPage, prevPage, onBack]);

  const copyAll = async () => {
    const fullText = data.paragraphs
      .map((p) => `[${p.timestamp}] ${p.text}`)
      .join("\n\n");
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fontSizeClasses = [
    "text-base",
    "text-lg",
    "text-xl",
  ];

  const pageVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
  };

  return (
    <motion.div
      className="flex min-h-dvh flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Top bar */}
      <motion.header
        className="sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur-md"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <motion.button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            whileHover={{ x: -2 }}
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">New video</span>
          </motion.button>

          <div className="flex items-center gap-1">
            <ThemeSwitcher />

            <div className="mx-1 h-4 w-px bg-border" />

            {data.language && data.language !== "en" && (
              <>
                <span className="flex h-7 items-center gap-1 rounded-md bg-accent px-2 text-xs text-muted-foreground">
                  <Globe className="h-3 w-3" />
                  {data.language.toUpperCase()}
                </span>
                <div className="mx-1 h-4 w-px bg-border" />
              </>
            )}

            <motion.button
              onClick={() => setFontSize((s) => Math.min(2, s + 1))}
              disabled={fontSize >= 2}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
              whileTap={{ scale: 0.9 }}
              aria-label="Increase font size"
            >
              <Type className="h-4 w-4" />
            </motion.button>

            <motion.button
              onClick={() => setFontSize((s) => Math.max(0, s - 1))}
              disabled={fontSize <= 0}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
              whileTap={{ scale: 0.9 }}
              aria-label="Decrease font size"
            >
              <Type className="h-3 w-3" />
            </motion.button>

            <div className="mx-1 h-4 w-px bg-border" />

            <motion.button
              onClick={() => setShowTimestamps((v) => !v)}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                showTimestamps
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              whileTap={{ scale: 0.9 }}
              aria-label="Toggle timestamps"
            >
              <Clock className="h-4 w-4" />
            </motion.button>

            <motion.button
              onClick={() =>
                setViewMode((v) => (v === "paged" ? "scroll" : "paged"))
              }
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                viewMode === "scroll"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              whileTap={{ scale: 0.9 }}
              aria-label={
                viewMode === "paged"
                  ? "Switch to scroll view"
                  : "Switch to paged view"
              }
            >
              {viewMode === "paged" ? (
                <Scroll className="h-4 w-4" />
              ) : (
                <BookOpenCheck className="h-4 w-4" />
              )}
            </motion.button>

            <div className="mx-1 h-4 w-px bg-border" />

            <motion.button
              onClick={copyAll}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              whileTap={{ scale: 0.9 }}
              aria-label="Copy full transcript"
            >
              {copied ? (
                <Check className="h-4 w-4 text-foreground" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </motion.button>
          </div>
        </div>
      </motion.header>

      {/* Reading area */}
      <div
        ref={containerRef}
        className={`flex flex-1 flex-col items-center px-6 py-8 ${
          viewMode === "paged" ? "justify-center" : ""
        }`}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (viewMode !== "paged") return;
          const diff = touchStartX.current - e.changedTouches[0].clientX;
          if (Math.abs(diff) > 60) {
            if (diff > 0) nextPage();
            else prevPage();
          }
        }}
      >
        {/* Title section — Playfair Display */}
        <motion.div
          className="mb-10 w-full max-w-2xl text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6 }}
        >
          <motion.h1
            className="mb-2 text-balance font-serif text-2xl font-medium tracking-tight text-foreground md:text-3xl"
            initial={{ opacity: 0, filter: "blur(10px)", y: 12 }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            transition={{ delay: 0.15, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            {data.title}
          </motion.h1>
          <motion.p
            className="text-sm text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            {data.totalSegments} segments
            {viewMode === "paged" && <> &middot; {totalPages} pages</>}
          </motion.p>
        </motion.div>

        <AnimatePresence mode="wait">
          {viewMode === "paged" ? (
            <motion.div
              key="paged"
              className="relative w-full max-w-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Navigation arrows */}
              <AnimatePresence>
                {showControls && currentPage > 0 && (
                  <motion.button
                    onClick={prevPage}
                    className="absolute -left-14 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card p-2 text-muted-foreground shadow-sm transition-colors hover:text-foreground lg:flex"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </motion.button>
                )}
                {showControls && currentPage < totalPages - 1 && (
                  <motion.button
                    onClick={nextPage}
                    className="absolute -right-14 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card p-2 text-muted-foreground shadow-sm transition-colors hover:text-foreground lg:flex"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </motion.button>
                )}
              </AnimatePresence>

              {/* The page card */}
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={currentPage}
                    custom={direction}
                    variants={pageVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{
                      x: { type: "spring", stiffness: 300, damping: 30 },
                      opacity: { duration: 0.25 },
                    }}
                    className="px-8 py-10 md:px-14 md:py-12"
                  >
                    <div className="flex flex-col gap-8">
                      {currentParagraphs.map((paragraph, i) => (
                        <RevealParagraph
                          key={`${currentPage}-${i}`}
                          paragraph={paragraph}
                          paragraphIndex={i}
                          showTimestamps={showTimestamps}
                          fontSizeClass={fontSizeClasses[fontSize]}
                          isFirstReveal={isFirstReveal && currentPage === 0}
                        />
                      ))}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Mobile navigation */}
              <div className="mt-6 flex items-center justify-center gap-4 lg:hidden">
                <motion.button
                  onClick={prevPage}
                  disabled={currentPage === 0}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  whileTap={{ scale: 0.9 }}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-5 w-5" />
                </motion.button>

                <motion.button
                  onClick={nextPage}
                  disabled={currentPage >= totalPages - 1}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  whileTap={{ scale: 0.9 }}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-5 w-5" />
                </motion.button>
              </div>

              {/* Page progress */}
              <motion.div
                className="mt-6 flex w-full flex-col items-center gap-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <div className="h-0.5 w-full max-w-xs overflow-hidden rounded-full bg-border">
                  <motion.div
                    className="h-full rounded-full bg-foreground/30"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${((currentPage + 1) / totalPages) * 100}%`,
                    }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground/60">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>
                    Page {currentPage + 1} of {totalPages}
                  </span>
                </div>
              </motion.div>
            </motion.div>
          ) : (
            /* Scroll view */
            <motion.div
              key="scroll"
              className="reader-scroll w-full max-w-2xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <div className="rounded-xl border border-border bg-card px-8 py-10 shadow-sm md:px-14 md:py-12">
                <div className="flex flex-col gap-8">
                  {data.paragraphs.map((paragraph, i) => (
                    <RevealParagraph
                      key={i}
                      paragraph={paragraph}
                      paragraphIndex={i}
                      showTimestamps={showTimestamps}
                      fontSizeClass={fontSizeClasses[fontSize]}
                      isFirstReveal={isFirstReveal}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Keyboard hint (paged only) */}
      {viewMode === "paged" && (
        <motion.div
          className="hidden items-center justify-center gap-4 border-t border-border/50 py-3 text-xs text-muted-foreground/40 lg:flex"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          <span className="flex items-center gap-1.5">
            <kbd className="inline-flex h-5 items-center justify-center rounded border border-border bg-card px-1.5 font-sans text-[10px]">
              &larr;
            </kbd>
            <kbd className="inline-flex h-5 items-center justify-center rounded border border-border bg-card px-1.5 font-sans text-[10px]">
              &rarr;
            </kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="inline-flex h-5 items-center justify-center rounded border border-border bg-card px-1.5 font-sans text-[10px]">
              Space
            </kbd>
            Next
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="inline-flex h-5 items-center justify-center rounded border border-border bg-card px-1.5 font-sans text-[10px]">
              Esc
            </kbd>
            Back
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}
