"use client";

import { motion } from "framer-motion";

const lines = [
  { width: "80%", delay: 0 },
  { width: "95%", delay: 0.1 },
  { width: "70%", delay: 0.2 },
  { width: "90%", delay: 0.3 },
  { width: "60%", delay: 0.4 },
  { width: "85%", delay: 0.5 },
  { width: "75%", delay: 0.6 },
];

export function LoadingState() {
  return (
    <motion.div
      className="flex min-h-dvh flex-col items-center justify-center px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Book opening animation */}
      <div className="relative mb-12">
        <motion.div
          className="flex gap-1"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Left page */}
          <motion.div
            className="h-32 w-24 rounded-l-md border border-border bg-card shadow-md"
            initial={{ rotateY: 0 }}
            animate={{ rotateY: [-20, 0, -20] }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{ transformOrigin: "right center" }}
          >
            <div className="flex flex-col gap-1.5 p-3 pt-4">
              {[65, 80, 50, 70, 60, 75].map((w, i) => (
                <motion.div
                  key={i}
                  className="h-1 rounded-full bg-border"
                  style={{ width: `${w}%` }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{
                    duration: 1.5,
                    delay: i * 0.08,
                    repeat: Infinity,
                  }}
                />
              ))}
            </div>
          </motion.div>

          {/* Right page */}
          <motion.div
            className="h-32 w-24 rounded-r-md border border-border bg-card shadow-md"
            initial={{ rotateY: 0 }}
            animate={{ rotateY: [20, 0, 20] }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{ transformOrigin: "left center" }}
          >
            <div className="flex flex-col gap-1.5 p-3 pt-4">
              {[70, 85, 55, 75, 65, 80].map((w, i) => (
                <motion.div
                  key={i}
                  className="h-1 rounded-full bg-border"
                  style={{ width: `${w}%` }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{
                    duration: 1.5,
                    delay: i * 0.08 + 0.5,
                    repeat: Infinity,
                  }}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>

        {/* Spine line */}
        <motion.div
          className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </div>

      <motion.p
        className="mb-8 font-serif text-xl font-medium text-muted-foreground"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        Preparing your reading...
      </motion.p>

      {/* Skeleton paragraph */}
      <motion.div
        className="w-full max-w-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
      >
        <div className="flex flex-col gap-2.5">
          {lines.map((line, i) => (
            <motion.div
              key={i}
              className="h-2.5 rounded-full bg-border"
              style={{ width: line.width }}
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{
                duration: 1.8,
                delay: line.delay,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
