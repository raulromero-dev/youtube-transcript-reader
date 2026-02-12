"use client";

import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import { Sun, Moon, BookOpen } from "lucide-react";
import { useEffect, useState } from "react";

const themes = [
  { id: "paper", icon: BookOpen, label: "Paper" },
  { id: "light", icon: Sun, label: "Light" },
  { id: "dark", icon: Moon, label: "Dark" },
] as const;

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Render a static placeholder during SSR to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
        {themes.map(({ id, icon: Icon }) => (
          <div
            key={id}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground"
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
      {themes.map(({ id, icon: Icon, label }) => {
        const active = theme === id;
        return (
          <button
            key={id}
            onClick={() => setTheme(id)}
            className={`btn-physical relative flex h-7 w-7 items-center justify-center rounded-md ${
              active
                ? "text-foreground"
                : "text-muted-foreground"
            }`}
            aria-label={`Switch to ${label} theme`}
          >
            {active && (
              <motion.div
                layoutId="theme-pill"
                className="absolute inset-0 rounded-md bg-accent/40"
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 30,
                }}
              />
            )}
            <Icon className="relative z-10 h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
