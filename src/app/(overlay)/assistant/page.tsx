"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  isTauri,
  startListening,
  stopListening,
  onShortcutPressed,
  onShortcutReleased,
  getAudioLevel,
  VoiceProcessingResult,
} from "@/lib/tauri";

type AssistantState = "idle" | "listening" | "handsfree" | "processing" | "success" | "error";

function formatActionFeedback(result: VoiceProcessingResult): string | null {
  const actionType = result.action?.action_type;
  if (!actionType || actionType === "NoAction" || actionType === "TypeText") return null;
  switch (actionType) {
    case "OpenApp": return `Opening ${result.action?.payload?.app || "app"}`;
    case "WebSearch": return `Searching...`;
    case "OpenUrl": return "Opening URL";
    case "VolumeControl": return `Volume ${result.action?.payload?.direction}`;
    case "SpotifyControl": return `${result.action?.payload?.action}`;
    case "SystemControl": return `${result.action?.payload?.action}`;
    default: return null;
  }
}

export default function AssistantPage() {
  const [state, setState] = useState<AssistantState>("idle");
  const [mounted, setMounted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const stateRef = useRef<AssistantState>("idle");
  const audioLevelInterval = useRef<NodeJS.Timeout | null>(null);
  const tooltipTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Show tooltip on hover with delay
  useEffect(() => {
    if (hovered && state === "idle") {
      tooltipTimeout.current = setTimeout(() => setShowTooltip(true), 300);
    } else {
      if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
      setShowTooltip(false);
    }
    return () => { if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current); };
  }, [hovered, state]);

  // Poll audio level when listening/handsfree
  useEffect(() => {
    if ((state === "listening" || state === "handsfree") && isTauri()) {
      audioLevelInterval.current = setInterval(async () => {
        try {
          const level = await getAudioLevel();
          setAudioLevel(level);
        } catch { /* ignore */ }
      }, 50);
    } else {
      if (audioLevelInterval.current) clearInterval(audioLevelInterval.current);
      setAudioLevel(0);
    }
    return () => { if (audioLevelInterval.current) clearInterval(audioLevelInterval.current); };
  }, [state]);

  const start = useCallback(async (handsfree = false) => {
    if (stateRef.current !== "idle") return;
    try {
      await startListening();
      setState(handsfree ? "handsfree" : "listening");
    } catch (e) { console.warn("Start failed:", e); }
  }, []);

  const stop = useCallback(async () => {
    if (stateRef.current !== "listening" && stateRef.current !== "handsfree") return;
    setState("processing");
    setFeedback(null);
    try {
      const result = await stopListening();
      if (result.action?.action_type === "NoAction") {
        setState("idle");
        return;
      }
      const feedbackText = formatActionFeedback(result);
      if (feedbackText) setFeedback(feedbackText);
      setState("success");
      setTimeout(() => { setState("idle"); setFeedback(null); }, feedbackText ? 1200 : 600);
    } catch {
      setState("error");
      setTimeout(() => { setState("idle"); setFeedback(null); }, 800);
    }
  }, []);

  const cancel = useCallback(() => {
    // Cancel without processing
    setState("idle");
    setFeedback(null);
  }, []);

  useEffect(() => {
    if (!mounted || !isTauri()) return;
    let unlistenPressed: (() => void) | undefined;
    let unlistenReleased: (() => void) | undefined;

    const setup = async () => {
      try {
        unlistenPressed = await onShortcutPressed(() => {
          if (stateRef.current === "idle") start(false); // Hold mode
        });
        unlistenReleased = await onShortcutReleased(() => {
          if (stateRef.current === "listening") stop();
        });
      } catch (e) { console.warn("Setup failed:", e); }
    };
    setup();
    return () => { unlistenPressed?.(); unlistenReleased?.(); };
  }, [mounted, start, stop]);

  const isActive = state !== "idle";

  return (
    <div className="h-full w-full flex items-center justify-center relative" style={{ background: "transparent" }}>
      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full mb-3 px-4 py-2 rounded-xl keep-bg whitespace-nowrap"
            style={{ background: "rgba(20,20,20,0.95)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <span className="text-sm text-white/90">
              Click or hold <span className="text-blue-400 font-medium">Ctrl + Space</span> to start dictating
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Pill */}
      <motion.div
        className="relative flex items-center justify-center rounded-full cursor-pointer overflow-hidden keep-bg"
        style={{
          background: "rgba(30,30,30,0.95)",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
        initial={false}
        animate={{
          width: state === "handsfree" ? 180 : (state === "listening" || state === "processing" ? 140 : 70),
          height: 32,
          boxShadow: isActive 
            ? "0 4px 20px rgba(0,0,0,0.4)" 
            : "0 2px 10px rgba(0,0,0,0.3)",
        }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => { if (state === "idle") start(true); }} // Click = handsfree mode
      >
        <AnimatePresence mode="wait">
          {state === "idle" && <IdlePill key="idle" />}
          {state === "listening" && <ListeningWave key="listening" level={audioLevel} />}
          {state === "handsfree" && <HandsfreePill key="handsfree" level={audioLevel} onCancel={cancel} onStop={stop} />}
          {state === "processing" && <ProcessingPill key="processing" />}
          {state === "success" && <SuccessPill key="success" feedback={feedback} />}
          {state === "error" && <ErrorPill key="error" />}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// Idle: Dotted waveform pattern (like Whispr Flow)
function IdlePill() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center justify-center gap-[4px] px-4"
    >
      {[...Array(10)].map((_, i) => (
        <div
          key={i}
          className="w-[4px] h-[4px] rounded-full"
          style={{ background: "rgba(255,255,255,0.35)" }}
        />
      ))}
    </motion.div>
  );
}

// Listening (hold mode): Just waveform
function ListeningWave({ level }: { level: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center justify-center gap-[2px] px-3"
    >
      {[...Array(12)].map((_, i) => {
        const centerDist = Math.abs(i - 5.5) / 5.5;
        const height = 4 + (20 - 4) * level * (1 - centerDist * 0.5) * (0.7 + Math.random() * 0.6);
        return (
          <motion.div
            key={i}
            className="w-[3px] rounded-full bg-white"
            animate={{ height }}
            transition={{ duration: 0.05 }}
          />
        );
      })}
    </motion.div>
  );
}

// Handsfree mode: Cancel + Waveform + Stop
function HandsfreePill({ level, onCancel, onStop }: { level: number; onCancel: () => void; onStop: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center justify-between w-full px-2"
    >
      {/* Cancel button */}
      <button
        onClick={(e) => { e.stopPropagation(); onCancel(); }}
        className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
      >
        <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Waveform */}
      <div className="flex items-center justify-center gap-[2px] flex-1 mx-2">
        {[...Array(10)].map((_, i) => {
          const centerDist = Math.abs(i - 4.5) / 4.5;
          const height = 4 + (18 - 4) * level * (1 - centerDist * 0.5) * (0.7 + Math.random() * 0.6);
          return (
            <motion.div
              key={i}
              className="w-[3px] rounded-full bg-white"
              animate={{ height }}
              transition={{ duration: 0.05 }}
            />
          );
        })}
      </div>

      {/* Stop button */}
      <button
        onClick={(e) => { e.stopPropagation(); onStop(); }}
        className="w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
      >
        <div className="w-3 h-3 rounded-sm bg-white" />
      </button>
    </motion.div>
  );
}

// Processing
function ProcessingPill() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center justify-center gap-[3px] px-3"
    >
      {[...Array(9)].map((_, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-white/60"
          animate={{ height: [3, 8, 3] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.05 }}
        />
      ))}
    </motion.div>
  );
}

// Success
function SuccessPill({ feedback }: { feedback: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex items-center gap-2 px-3"
    >
      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
      {feedback && <span className="text-xs text-white/90 truncate max-w-24">{feedback}</span>}
    </motion.div>
  );
}

// Error
function ErrorPill() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex items-center gap-2 px-3"
    >
      <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
      </svg>
      <span className="text-xs text-white/80">Failed</span>
    </motion.div>
  );
}
