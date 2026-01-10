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

type AssistantState = "idle" | "listening" | "processing" | "success" | "error";

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
  const stateRef = useRef<AssistantState>("idle");
  const audioLevelInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Poll audio level when listening
  useEffect(() => {
    if (state === "listening" && isTauri()) {
      audioLevelInterval.current = setInterval(async () => {
        try {
          const level = await getAudioLevel();
          setAudioLevel(level);
        } catch {
          // Ignore errors
        }
      }, 50); // 20fps for smooth animation
    } else {
      if (audioLevelInterval.current) {
        clearInterval(audioLevelInterval.current);
        audioLevelInterval.current = null;
      }
      setAudioLevel(0);
    }
    return () => {
      if (audioLevelInterval.current) {
        clearInterval(audioLevelInterval.current);
      }
    };
  }, [state]);

  const start = useCallback(async () => {
    if (stateRef.current !== "idle") return;
    try {
      await startListening();
      setState("listening");
    } catch (e) {
      console.warn("Start failed:", e);
    }
  }, []);

  const stop = useCallback(async () => {
    if (stateRef.current !== "listening") return;
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
      } catch (e) { console.warn("Setup failed:", e); }
    };
    setup();
    return () => { unlistenPressed?.(); unlistenReleased?.(); };
  }, [mounted, start, stop]);

  const isActive = state !== "idle";

  return (
    <div className="h-full w-full flex items-center justify-center" style={{ background: "transparent" }}>
      <motion.div
        className="relative flex items-center justify-center rounded-full cursor-pointer overflow-hidden"
        style={{
          background: isActive 
            ? "linear-gradient(135deg, rgba(59,130,246,0.95), rgba(147,51,234,0.95))"
            : "rgba(20,20,20,0.9)",
          backdropFilter: "blur(16px)",
          border: isActive ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(255,255,255,0.08)",
        }}
        initial={false}
        animate={{
          width: isActive ? 160 : (hovered ? 110 : 44),
          height: 28,
          boxShadow: isActive 
            ? `0 0 ${20 + audioLevel * 30}px rgba(99,102,241,${0.4 + audioLevel * 0.4})` 
            : "0 2px 8px rgba(0,0,0,0.4)",
        }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => { if (state === "idle") start(); }}
      >
        <AnimatePresence mode="wait">
          {state === "idle" && <IdlePill key="idle" hovered={hovered} />}
          {state === "listening" && <LiveWaveform key="listening" level={audioLevel} />}
          {state === "processing" && <ProcessingSpinner key="processing" />}
          {state === "success" && <SuccessCheck key="success" feedback={feedback} />}
          {state === "error" && <ErrorX key="error" />}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function IdlePill({ hovered }: { hovered: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-1.5 px-2"
    >
      <motion.div
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <svg className="w-3.5 h-3.5 text-white/60" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V19h4v2H8v-2h4v-3.07z"/>
        </svg>
      </motion.div>
      <AnimatePresence>
        {hovered && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            className="text-[10px] text-white/50 whitespace-nowrap overflow-hidden font-medium"
          >
            Ctrl+Space
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function LiveWaveform({ level }: { level: number }) {
  const bars = 16;
  // Create varied heights based on audio level with some randomness for natural look
  const getBarHeight = (index: number) => {
    const baseHeight = 3;
    const maxHeight = 18;
    // Create a wave pattern centered in the middle
    const centerDistance = Math.abs(index - bars / 2) / (bars / 2);
    const waveMultiplier = 1 - centerDistance * 0.5;
    // Add some randomness that changes with level
    const randomFactor = 0.7 + Math.random() * 0.6;
    return baseHeight + (maxHeight - baseHeight) * level * waveMultiplier * randomFactor;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center justify-center gap-[2px] px-2 h-full"
    >
      {[...Array(bars)].map((_, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full"
          style={{
            background: `linear-gradient(to top, rgba(255,255,255,0.9), rgba(255,255,255,0.6))`,
          }}
          animate={{ 
            height: getBarHeight(i),
            opacity: 0.5 + level * 0.5,
          }}
          transition={{
            height: { duration: 0.05, ease: "linear" },
            opacity: { duration: 0.1 },
          }}
        />
      ))}
    </motion.div>
  );
}

function ProcessingSpinner() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-1.5 px-2"
    >
      <motion.div
        className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white"
        animate={{ rotate: 360 }}
        transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
      />
      <span className="text-[10px] text-white/80 font-medium">Processing</span>
    </motion.div>
  );
}

function SuccessCheck({ feedback }: { feedback: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="flex items-center gap-1.5 px-2"
    >
      <motion.svg 
        className="w-3.5 h-3.5 text-green-400" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3 }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </motion.svg>
      {feedback && <span className="text-[10px] text-white/90 truncate max-w-28 font-medium">{feedback}</span>}
    </motion.div>
  );
}

function ErrorX() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="flex items-center gap-1.5 px-2"
    >
      <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
      </svg>
      <span className="text-[10px] text-white/80 font-medium">Failed</span>
    </motion.div>
  );
}
