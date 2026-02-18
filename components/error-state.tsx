"use client";

import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft } from "lucide-react";

interface ErrorStateProps {
  message: string;
  onBack: () => void;
}

export function ErrorState({ message, onBack }: ErrorStateProps) {
  return (
    <motion.div
      className="flex min-h-dvh flex-col items-center justify-center px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        className="btn-physical flex h-16 w-16 items-center justify-center rounded-2xl"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <AlertCircle className="h-7 w-7 text-muted-foreground" />
      </motion.div>

      <motion.h2
        className="mt-6 font-serif text-2xl font-medium text-foreground"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        Something went wrong
      </motion.h2>

      <motion.p
        className="mt-3 max-w-sm text-center text-base leading-relaxed text-muted-foreground"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        {message}
      </motion.p>

      <motion.button
        onClick={onBack}
        className="btn-physical mt-8 flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm text-foreground"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <ArrowLeft className="h-4 w-4" />
        Try another video
      </motion.button>
    </motion.div>
  );
}
