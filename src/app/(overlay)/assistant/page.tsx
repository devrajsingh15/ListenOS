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
import { listen } from "@tauri-apps/api/event";

type AssistantState = "idle" | "listening" | "handsfree" | "processing" | "success" | "error";
type NotificationType = "first-transcription" | "word-learned" | null;

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

// Check if this is the first transcription
function isFirstTranscription(): boolean {
  if (typeof window === "undefined") return false;
  return !localStorage.getItem("listenos_first_transcription_done");
}

function markFirstTranscriptionDone() {
  if (typeof window !== "undefined") {
    localStorage.setItem("listenos_first_transcription_done", "true");
  }
}

export default function AssistantPage() {
  const [state, setState] = useState<AssistantState>("idle");
  const [mounted, setMounted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const [notification, setNotification] = useState<NotificationType>(null);
  const [learnedWord, setLearnedWord] = useState<string | null>(null);
  const stateRef = useRef<AssistantState>("idle");
  const audioLevelInterval = useRef<NodeJS.Timeout | null>(null);
  const tooltipTimeout = useRef<NodeJS.Timeout | null>(null);
  const transcriptionCount = useRef(0);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Listen for word-learned events from backend
  useEffect(() => {
    if (!mounted || !isTauri()) return;
    
    let unlisten: (() => void) | undefined;
    
    const setup = async () => {
      try {
        unlisten = await listen<{ word: string }>("word-learned", (event) => {
          setLearnedWord(event.payload.word);
          setNotification("word-learned");
          setTimeout(() => setNotification(null), 3000);
        });
      } catch (e) {
        console.warn("Failed to listen for word-learned:", e);
      }
    };
    
    setup();
    return () => { unlisten?.(); };
  }, [mounted]);

  // Show tooltip on hover with delay
  useEffect(() => {
    if (hovered && state === "idle" && !notification) {
      tooltipTimeout.current = setTimeout(() => setShowTooltip(true), 300);
    } else {
      if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
      setShowTooltip(false);
    }
    return () => { if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current); };
  }, [hovered, state, notification]);

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
      
      // Check for first transcription
      transcriptionCount.current++;
      if (isFirstTranscription() && result.transcription?.text) {
        markFirstTranscriptionDone();
        setNotification("first-transcription");
        setTimeout(() => setNotification(null), 4000);
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
          if (stateRef.current === "idle") start(false);
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
    <div className="h-full w-full flex flex-col items-center justify-end pb-2 relative" style={{ background: "transparent" }}>
      {/* Notification Popup */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full mb-3 px-5 py-4 rounded-2xl keep-bg max-w-xs"
            style={{ background: "rgba(20,20,20,0.98)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            {notification === "first-transcription" && (
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="text-2xl">🎉</span>
                <span className="text-sm font-medium text-white">First transcription complete!</span>
                <span className="text-xs text-white/60">You&apos;re all set to use voice dictation</span>
              </div>
            )}
            {notification === "word-learned" && learnedWord && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-white">&quot;{learnedWord}&quot; added to dictionary</span>
                  <span className="text-xs text-white/50">Will be recognized better next time</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && !notification && (
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
        onClick={() => { if (state === "idle") start(true); }}
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

function IdlePill() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center justify-center gap-[4px] px-4"
    >
      {[...Array(10)].map((_, i) => (
        <div key={i} className="w-[4px] h-[4px] rounded-full" style={{ background: "rgba(255,255,255,0.35)" }} />
      ))}
    </motion.div>
  );
}

function ListeningWave({ level }: { level: number }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-[2px] px-3">
      {[...Array(12)].map((_, i) => {
        const centerDist = Math.abs(i - 5.5) / 5.5;
        const height = 4 + (20 - 4) * level * (1 - centerDist * 0.5) * (0.7 + Math.random() * 0.6);
        return <motion.div key={i} className="w-[3px] rounded-full bg-white" animate={{ height }} transition={{ duration: 0.05 }} />;
      })}
    </motion.div>
  );
}

function HandsfreePill({ level, onCancel, onStop }: { level: number; onCancel: () => void; onStop: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-between w-full px-2">
      <button onClick={(e) => { e.stopPropagation(); onCancel(); }} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
        <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <div className="flex items-center justify-center gap-[2px] flex-1 mx-2">
        {[...Array(10)].map((_, i) => {
          const centerDist = Math.abs(i - 4.5) / 4.5;
          const height = 4 + (18 - 4) * level * (1 - centerDist * 0.5) * (0.7 + Math.random() * 0.6);
          return <motion.div key={i} className="w-[3px] rounded-full bg-white" animate={{ height }} transition={{ duration: 0.05 }} />;
        })}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onStop(); }} className="w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors">
        <div className="w-3 h-3 rounded-sm bg-white" />
      </button>
    </motion.div>
  );
}

function ProcessingPill() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-[3px] px-3">
      {[...Array(9)].map((_, i) => (
        <motion.div key={i} className="w-[3px] rounded-full bg-white/60" animate={{ height: [3, 8, 3] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.05 }} />
      ))}
    </motion.div>
  );
}

function SuccessPill({ feedback }: { feedback: string | null }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex items-center gap-2 px-3">
      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
      {feedback && <span className="text-xs text-white/90 truncate max-w-24">{feedback}</span>}
    </motion.div>
  );
}

function ErrorPill() {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex items-center gap-2 px-3">
      <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
      </svg>
      <span className="text-xs text-white/80">Failed</span>
    </motion.div>
  );
}
