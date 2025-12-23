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
      }, 800);
    } catch (e) {
      console.warn("Stop listening failed:", e);
      setState("error");
      setTimeout(() => {
        if (isTauri()) hideAssistant().catch(() => {});
        setState("idle");
      }, 1200);
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
        {state === "listening" && <ListeningIndicator key="listening" />}
        {state === "processing" && <ProcessingIndicator key="processing" />}
        {state === "success" && <SuccessIndicator key="success" />}
        {state === "error" && <ErrorIndicator key="error" />}
      </AnimatePresence>
    </div>
  );
}

function ListeningIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -5 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="relative"
    >
      {/* Outer glow */}
      <motion.div
        className="absolute inset-0 rounded-2xl"
        animate={{
          boxShadow: [
            "0 0 20px rgba(139, 92, 246, 0.3), 0 0 40px rgba(59, 130, 246, 0.2)",
            "0 0 30px rgba(139, 92, 246, 0.5), 0 0 60px rgba(59, 130, 246, 0.3)",
            "0 0 20px rgba(139, 92, 246, 0.3), 0 0 40px rgba(59, 130, 246, 0.2)",
          ],
        }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Glass container */}
      <div
        className="relative flex items-center gap-3 px-5 py-3 rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.18)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        }}
      >
        {/* Animated gradient background */}
        <motion.div
          className="absolute inset-0"
          animate={{
            background: [
              "linear-gradient(45deg, rgba(139,92,246,0.15) 0%, rgba(59,130,246,0.15) 50%, rgba(236,72,153,0.15) 100%)",
              "linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(236,72,153,0.15) 50%, rgba(139,92,246,0.15) 100%)",
              "linear-gradient(225deg, rgba(236,72,153,0.15) 0%, rgba(139,92,246,0.15) 50%, rgba(59,130,246,0.15) 100%)",
              "linear-gradient(45deg, rgba(139,92,246,0.15) 0%, rgba(59,130,246,0.15) 50%, rgba(236,72,153,0.15) 100%)",
            ],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />

        {/* Pulsing mic icon */}
        <motion.div
          className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full"
          style={{
            background: "linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)",
          }}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
        >
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </motion.div>

        {/* Waveform bars */}
        <div className="relative z-10 flex items-center gap-0.5 h-6">
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className="w-1 rounded-full"
              style={{
                background: `linear-gradient(to top, #8b5cf6, #3b82f6)`,
              }}
              animate={{
                height: ["30%", `${50 + Math.random() * 50}%`, "30%"],
                opacity: [0.6, 1, 0.6],
              }}
              transition={{
                duration: 0.4 + Math.random() * 0.3,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.05,
              }}
            />
          ))}
        </div>

        {/* Listening text */}
        <motion.span
          className="relative z-10 text-sm font-medium text-white/90"
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          Listening...
        </motion.span>
      </div>
    </motion.div>
  );
}

function ProcessingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="flex items-center gap-3 px-5 py-3 rounded-2xl"
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.18)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      }}
    >
      {/* Spinning gradient ring */}
      <div className="relative w-6 h-6">
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: "conic-gradient(from 0deg, #8b5cf6, #3b82f6, #06b6d4, #8b5cf6)",
            padding: "2px",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <div
            className="w-full h-full rounded-full"
            style={{ background: "rgba(0,0,0,0.8)" }}
          />
        </motion.div>
      </div>

      <span className="text-sm font-medium text-white/80">Processing...</span>
    </motion.div>
  );
}

function SuccessIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, y: -10 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      className="flex items-center gap-2 px-4 py-2.5 rounded-2xl"
      style={{
        background: "linear-gradient(135deg, rgba(34, 197, 94, 0.9) 0%, rgba(22, 163, 74, 0.9) 100%)",
        boxShadow: "0 8px 32px rgba(34, 197, 94, 0.4), 0 0 20px rgba(34, 197, 94, 0.3)",
      }}
    >
      {/* Checkmark with draw animation */}
      <motion.svg
        className="w-5 h-5 text-white"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <motion.path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={3}
          d="M5 13l4 4L19 7"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </motion.svg>
      <span className="text-sm font-semibold text-white">Done</span>
    </motion.div>
  );
}

function ErrorIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      className="flex items-center gap-2 px-4 py-2.5 rounded-2xl"
      style={{
        background: "linear-gradient(135deg, rgba(239, 68, 68, 0.9) 0%, rgba(220, 38, 38, 0.9) 100%)",
        boxShadow: "0 8px 32px rgba(239, 68, 68, 0.4), 0 0 20px rgba(239, 68, 68, 0.3)",
      }}
    >
      <motion.svg
        className="w-5 h-5 text-white"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        initial={{ rotate: -90 }}
        animate={{ rotate: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={3}
          d="M6 18L18 6M6 6l12 12"
        />
      </motion.svg>
      <span className="text-sm font-semibold text-white">Error</span>
    </motion.div>
  );
}
