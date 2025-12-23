"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  isTauri,
  startListening,
  stopListening,
  onShortcutPressed,
  onShortcutReleased,
  hideAssistant,
} from "@/lib/tauri";

type AssistantState = "idle" | "listening" | "processing" | "success" | "error";

export default function AssistantPage() {
  const [state, setState] = useState<AssistantState>("idle");
  const [mounted, setMounted] = useState(false);

  const stateRef = useRef<AssistantState>("idle");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const start = useCallback(async () => {
    if (stateRef.current !== "idle") return;
    try {
      await startListening();
      setState("listening");
    } catch (e) {
      console.warn("Start listening failed:", e);
    }
  }, []);

  const stop = useCallback(async () => {
    if (stateRef.current !== "listening") return;
    setState("processing");
    try {
      await stopListening();
      setState("success");
      setTimeout(() => {
        if (isTauri()) hideAssistant().catch(() => {});
        setState("idle");
      }, 600);
    } catch (e) {
      console.warn("Stop listening failed:", e);
      setState("error");
      setTimeout(() => {
        if (isTauri()) hideAssistant().catch(() => {});
        setState("idle");
      }, 800);
    }
  }, []);

  useEffect(() => {
    if (!mounted || !isTauri()) return;

    let unlistenPressed: (() => void) | undefined;
    let unlistenReleased: (() => void) | undefined;

    const setup = async () => {
      try {
        unlistenPressed = await onShortcutPressed(() => {
          if (stateRef.current === "idle") start();
        });
        unlistenReleased = await onShortcutReleased(() => {
          if (stateRef.current === "listening") stop();
        });
      } catch (e) {
        console.warn("Failed to setup event listeners:", e);
      }
    };

    setup();
    return () => {
      unlistenPressed?.();
      unlistenReleased?.();
    };
  }, [mounted, start, stop]);

  return (
    <div
      className="h-full w-full flex items-center justify-center"
      style={{ background: "transparent" }}
    >
      <AnimatePresence mode="wait">
        {state === "listening" && <ListeningAnimation key="listening" />}
        {state === "processing" && <ProcessingAnimation key="processing" />}
        {state === "success" && <SuccessAnimation key="success" />}
        {state === "error" && <ErrorAnimation key="error" />}
      </AnimatePresence>
    </div>
  );
}

// Listening: Animated waveform bars with rainbow gradient
function ListeningAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="flex items-center gap-1 h-8"
    >
      {[...Array(12)].map((_, i) => {
        const hue = (i * 30) % 360;
        return (
          <motion.div
            key={i}
            className="w-1.5 rounded-full"
            style={{
              background: `linear-gradient(to top, hsl(${hue}, 100%, 60%), hsl(${(hue + 60) % 360}, 100%, 70%))`,
              boxShadow: `0 0 8px hsl(${hue}, 100%, 50%)`,
            }}
            animate={{
              height: ["20%", `${40 + Math.random() * 60}%`, "20%"],
              opacity: [0.7, 1, 0.7],
            }}
            transition={{
              duration: 0.3 + Math.random() * 0.2,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.04,
            }}
          />
        );
      })}
    </motion.div>
  );
}

// Processing: Spinning gradient ring
function ProcessingAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className="relative w-8 h-8"
    >
      {/* Outer spinning ring */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: "conic-gradient(from 0deg, #8b5cf6, #3b82f6, #06b6d4, #10b981, #8b5cf6)",
          padding: "3px",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
      >
        <div
          className="w-full h-full rounded-full"
          style={{ background: "transparent" }}
        />
      </motion.div>
      
      {/* Glow effect */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{
          boxShadow: [
            "0 0 15px rgba(139, 92, 246, 0.5)",
            "0 0 25px rgba(59, 130, 246, 0.6)",
            "0 0 15px rgba(139, 92, 246, 0.5)",
          ],
        }}
        transition={{ duration: 1, repeat: Infinity }}
      />
    </motion.div>
  );
}

// Success: Green pulsing circle with checkmark animation
function SuccessAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ type: "spring", stiffness: 500, damping: 15 }}
      className="relative w-8 h-8"
    >
      {/* Green circle */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
          boxShadow: "0 0 20px rgba(34, 197, 94, 0.6)",
        }}
        animate={{
          boxShadow: [
            "0 0 20px rgba(34, 197, 94, 0.6)",
            "0 0 30px rgba(34, 197, 94, 0.8)",
            "0 0 20px rgba(34, 197, 94, 0.6)",
          ],
        }}
        transition={{ duration: 0.5, repeat: 1 }}
      />
      
      {/* Checkmark */}
      <svg
        className="absolute inset-0 w-full h-full p-1.5"
        fill="none"
        stroke="white"
        viewBox="0 0 24 24"
      >
        <motion.path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={3}
          d="M5 13l4 4L19 7"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        />
      </svg>
    </motion.div>
  );
}

// Error: Red pulsing X
function ErrorAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ type: "spring", stiffness: 500, damping: 15 }}
      className="relative w-8 h-8"
    >
      {/* Red circle */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
          boxShadow: "0 0 20px rgba(239, 68, 68, 0.6)",
        }}
      />
      
      {/* X mark */}
      <svg
        className="absolute inset-0 w-full h-full p-2"
        fill="none"
        stroke="white"
        viewBox="0 0 24 24"
      >
        <motion.path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={3}
          d="M6 18L18 6M6 6l12 12"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        />
      </svg>
    </motion.div>
  );
}
