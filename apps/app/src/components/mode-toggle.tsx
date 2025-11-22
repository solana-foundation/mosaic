"use client";

import { useEffect, useState } from "react";
import { IconSunMaxFill, IconMoonStarsFill } from "symbols-react";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "motion/react";

import { Button } from "@/components/ui/button";

export function ModeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="relative rounded-md cursor-pointer border-0 border-transparent outline-transparent ring-0 ring-transparent focus:border-transparent focus:outline-transparent focus:ring-transparent active:scale-[0.98] active:border-0 active:border-transparent active:outline-0 active:ring-0 active:ring-transparent"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {resolvedTheme === "light" ? (
          <motion.div
            key="sun"
            initial={{ opacity: 0, rotate: -90 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: 90 }}
            transition={{ duration: 0.2 }}
          >
            <IconSunMaxFill className="h-[1.2rem] w-[1.2rem] fill-zinc-900 dark:fill-zinc-100" />
          </motion.div>
        ) : (
          <motion.div
            key="moon"
            initial={{ opacity: 0, rotate: -90 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: 90 }}
            transition={{ duration: 0.2 }}
          >
            <IconMoonStarsFill className="h-[1.2rem] w-[1.2rem] fill-zinc-900 dark:fill-zinc-100" />
          </motion.div>
        )}
      </AnimatePresence>
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
