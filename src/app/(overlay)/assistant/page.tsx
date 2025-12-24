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
  VoiceProcessingResult,
} from "@/lib/tauri";

type AssistantState = "idle" | "listening" | "processing" | "success" | "error";

// Format action type for display
function formatActionFeedback(result: VoiceProcessingResult): string | null {
  const actionType = result.action?.action_type;
  if (!actionType || actionType === "NoAction" || actionType === "TypeText") {
    return null; // Don't show feedback for typing or no action
  }
  
  // Format action type to readable text
  const formatted = actionType
    .replace(/([A-Z])/g, " $1") // Add space before caps
    .trim()
    .toLowerCase();
  
  // Get specific feedback based on action
  switch (actionType) {
    case "OpenApp":
      return `Opening ${result.action?.payload?.app || "app"}`;
    case "WebSearch":
      return `Searching: ${result.action?.payload?.query || "..."}`;
    case "OpenUrl":
      return "Opening URL";
    case "VolumeControl":
      return `Volume ${result.action?.payload?.direction || "changed"}`;
    case "KeyboardShortcut":
      return `${result.action?.payload?.shortcut || "Shortcut"}`;
    case "WindowControl":
      return `Window: ${result.action?.payload?.action || "control"}`;
    case "SpotifyControl":
      return `Media: ${result.action?.payload?.action || "control"}`;
    case "SystemControl":
      return `System: ${result.action?.payload?.action || "control"}`;
    case "Respond":
      return result.response_text ? result.response_text.slice(0, 50) : null;
    default:
      return formatted;
  }
}

export default function AssistantPage() {
  const [state, setState] = useState<AssistantState>("listening");
  const [mounted, setMounted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const stateRef = useRef<AssistantState>("listening");

  useEffect(() => {
    // Intentional: set mounted state on component mount for hydration
    setMounted(true); // eslint-disable-line react-hooks/set-state-in-effect
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
    setFeedback(null);
    try {
      const result = await stopListening();
      // If no input detected, silently dismiss without any animation
      if (result.action?.action_type === "NoAction") {
        setState("idle");
        if (isTauri()) hideAssistant().catch(() => {});
        return;
      }
      
      // Get feedback text for the action
      const feedbackText = formatActionFeedback(result);
      if (feedbackText) {
        setFeedback(feedbackText);
      }
      
      setState("success");
      setTimeout(() => {
        if (isTauri()) hideAssistant().catch(() => {});
        setState("idle");
        setFeedback(null);
      }, feedbackText ? 1000 : 600); // Show feedback a bit longer
    } catch (e) {
      console.warn("Stop listening failed:", e);
      setState("error");
      setTimeout(() => {
        if (isTauri()) hideAssistant().catch(() => {});
        setState("idle");
        setFeedback(null);
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
      <div className="relative flex flex-col items-center justify-center w-full h-full gap-2">
        <AnimatePresence mode="wait">
          {state === "listening" && <ListeningAnimation key="listening" />}
          {state === "processing" && <ProcessingAnimation key="processing" />}
          {state === "success" && <SuccessAnimation key="success" feedback={feedback} />}
          {state === "error" && <ErrorAnimation key="error" />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Idle: Pulsing pill
function IdleAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-2"
    >
      <div className="flex gap-1">
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-white/50 keep-bg"
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

// Listening: Voice Waveform
function ListeningAnimation() {
  const bars = 20;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-1 h-8"
    >
      {[...Array(bars)].map((_, i) => (
        <motion.div
          key={i}
          className="w-1.5 rounded-full bg-gradient-to-t from-blue-500 to-purple-500 keep-bg"
          animate={{
            height: [8, Math.random() * 24 + 8, 8],
          }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            repeatType: "reverse",
            delay: i * 0.05,
            ease: "easeInOut",
          }}
        />
      ))}
    </motion.div>
  );
}

// Processing: Spinning Galaxy Ring
function ProcessingAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      className="relative w-8 h-8"
    >
      {/* Outer spinning ring */}
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 border-r-purple-500 keep-bg"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      />
      {/* Inner spinning ring (reverse) */}
      <motion.div
        className="absolute inset-1 rounded-full border-2 border-transparent border-b-blue-400 border-l-purple-400 keep-bg"
        animate={{ rotate: -360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      />
      {/* Core glow */}
      <div className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-white/80 blur-sm keep-bg" />
    </motion.div>
  );
}

// Success: Check with optional feedback text
function SuccessAnimation({ feedback }: { feedback: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="flex flex-col items-center justify-center gap-1"
    >
      <div className="flex items-center gap-2 text-green-400">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        {feedback && (
          <span className="text-xs text-white/90 font-medium max-w-48 truncate">
            {feedback}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// Error: Simple X (no text)
function ErrorAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="flex items-center justify-center text-red-400"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </motion.div>
  );
}
