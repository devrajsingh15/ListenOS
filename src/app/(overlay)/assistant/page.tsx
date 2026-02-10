"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  isTauri,
  startListening,
  stopListening,
  getPendingAction,
  confirmPendingAction,
  cancelPendingAction,
  onShortcutPressed,
  onShortcutReleased,
  getAudioLevel,
  playTtsFromBase64,
  speakWithFallbackTts,
  VoiceProcessingResult,
  PendingAction,
} from "@/lib/tauri";
import { listen } from "@tauri-apps/api/event";

type AssistantState = "idle" | "listening" | "handsfree" | "processing" | "success" | "error";
type NotificationType = "first-transcription" | "word-learned" | null;

function formatActionFeedback(result: VoiceProcessingResult): string | null {
  const actionType = result.action?.action_type;
  if (!actionType || actionType === "NoAction" || actionType === "TypeText") return null;
  const ttsError = typeof result.action?.payload?.tts_error === "string"
    ? result.action.payload.tts_error
    : null;

  if (ttsError && (actionType === "Respond" || actionType === "Clarify")) {
    return `Voice reply unavailable: ${ttsError}`;
  }

  switch (actionType) {
    case "OpenApp": return `Opening ${result.action?.payload?.app || "app"}`;
    case "WebSearch": return `Searching...`;
    case "OpenUrl": return "Opening URL";
    case "VolumeControl": return `Volume ${result.action?.payload?.direction}`;
    case "SpotifyControl": return `${result.action?.payload?.action}`;
    case "SystemControl":
      return typeof result.response_text === "string" && result.response_text.length > 0
        ? result.response_text
        : `${result.action?.payload?.action}`;
    case "Respond":
    case "Clarify":
      return result.response_text || result.action?.response_text || "Answered";
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
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
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
    if (hovered && state === "idle" && !notification && !pendingAction) {
      tooltipTimeout.current = setTimeout(() => setShowTooltip(true), 300);
    } else {
      if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
      setShowTooltip(false);
    }
    return () => { if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current); };
  }, [hovered, state, notification, pendingAction]);

  useEffect(() => {
    if (!mounted || !isTauri()) return;
    getPendingAction()
      .then((pending) => setPendingAction(pending))
      .catch(() => undefined);
  }, [mounted]);

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
    if (stateRef.current !== "idle" || pendingAction) return;
    try {
      await startListening();
      setState(handsfree ? "handsfree" : "listening");
    } catch (e) { console.warn("Start failed:", e); }
  }, [pendingAction]);

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

      const isConversational = result.action?.action_type === "Respond" ||
        result.action?.action_type === "Clarify";

      const ttsBase64 = typeof result.action?.payload?.tts_base64 === "string"
        ? result.action.payload.tts_base64
        : null;
      if (ttsBase64) {
        void playTtsFromBase64(ttsBase64).catch((err) => {
          console.warn("Failed to play TTS audio:", err);
        });
      } else {
        const fallbackSpeech = result.response_text || result.action?.response_text;
        if (typeof fallbackSpeech === "string" && fallbackSpeech.trim().length > 0) {
          speakWithFallbackTts(fallbackSpeech);
        }
      }

      if (result.action?.requires_confirmation) {
        const pending = await getPendingAction();
        setPendingAction(pending);
        setFeedback(pending?.summary || "Awaiting confirmation");
        setState("success");
        return;
      }

      if (!result.executed && result.action?.action_type !== "NoAction") {
        const executionError = typeof result.action?.payload?.execution_error === "string"
          ? result.action.payload.execution_error
          : null;
        const failureText = executionError || result.response_text || "Action failed";
        setFeedback(failureText);
        setState("error");
        setTimeout(() => { setState("idle"); setFeedback(null); }, 2800);
        return;
      }
      
      // Check for first transcription
      transcriptionCount.current++;
      if (isFirstTranscription() && result.transcription?.text) {
        markFirstTranscriptionDone();
        setNotification(null);
      }
      
      const fallbackFeedback = typeof result.action?.payload?.execution_message === "string"
        ? result.action.payload.execution_message
        : (result.response_text || result.action?.response_text || null);
      const feedbackText = formatActionFeedback(result) || fallbackFeedback;
      if (feedbackText) setFeedback(feedbackText);
      setState("success");
      const displayMs = isConversational ? 4500 : (feedbackText ? 1200 : 600);
      setTimeout(() => { setState("idle"); setFeedback(null); }, displayMs);
    } catch {
      setState("error");
      setTimeout(() => { setState("idle"); setFeedback(null); }, 800);
    }
  }, []);

  const handleConfirmPending = useCallback(async () => {
    if (!pendingAction) return;
    setState("processing");
    try {
      const result = await confirmPendingAction();
      setPendingAction(null);
      setFeedback(result.message || "Action confirmed");
      setState("success");
      setTimeout(() => { setState("idle"); setFeedback(null); }, 900);
    } catch {
      setState("error");
      setTimeout(() => { setState("idle"); setFeedback(null); }, 800);
    }
  }, [pendingAction]);

  const handleCancelPending = useCallback(async () => {
    if (!pendingAction) return;
    try {
      await cancelPendingAction();
      setPendingAction(null);
      setFeedback("Action canceled");
      setState("success");
      setTimeout(() => { setState("idle"); setFeedback(null); }, 800);
    } catch {
      setState("error");
      setTimeout(() => { setState("idle"); setFeedback(null); }, 800);
    }
  }, [pendingAction]);

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
        {notification && learnedWord && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            className="absolute bottom-full mb-3 h-8 px-3 rounded-full keep-bg flex items-center gap-2"
            style={{ background: "rgba(20,20,20,0.9)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            <div className="w-2 h-2 rounded-full bg-green-400 keep-bg" />
            <span className="text-[10px] text-white/80 truncate max-w-36">{learnedWord}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pending confirmation popup */}
      <AnimatePresence>
        {pendingAction && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            className="absolute bottom-full mb-3 px-4 py-3 rounded-2xl keep-bg w-[320px]"
            style={{ background: "rgba(20,20,20,0.98)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            <div className="flex flex-col gap-2">
              <span className="text-[10px] tracking-wide uppercase text-yellow-300/90">Confirmation required</span>
              <span className="text-sm text-white/95">{pendingAction.summary}</span>
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={handleConfirmPending}
                  className="px-3 py-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-300 text-xs font-medium transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={handleCancelPending}
                  className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
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
          width: state === "handsfree" ? 140 : (state === "listening" || state === "processing" ? 100 : 44),
          height: state === "idle" ? 20 : 24,
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
          {state === "success" && <SuccessPill key="success" />}
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
      className="flex items-center justify-center gap-[3px] px-2"
    >
      {[...Array(6)].map((_, i) => (
        <div key={i} className="w-[3px] h-[3px] rounded-full keep-bg" style={{ background: "rgba(255,255,255,0.4)" }} />
      ))}
    </motion.div>
  );
}

function ListeningWave({ level }: { level: number }) {
  const normalizedLevel = Math.max(0.15, level); // Minimum animation even when quiet
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-[2px] px-2">
      {[...Array(8)].map((_, i) => {
        const centerDist = Math.abs(i - 3.5) / 3.5;
        const baseHeight = 3;
        const maxHeight = 14;
        const height = baseHeight + (maxHeight - baseHeight) * normalizedLevel * (1 - centerDist * 0.4) * (0.6 + Math.random() * 0.4);
        return <motion.div key={i} className="w-[2px] rounded-full bg-blue-400 keep-bg" animate={{ height }} transition={{ duration: 0.05 }} />;
      })}
    </motion.div>
  );
}

function HandsfreePill({ level, onCancel, onStop }: { level: number; onCancel: () => void; onStop: () => void }) {
  const normalizedLevel = Math.max(0.15, level); // Minimum animation
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-between w-full px-1">
      <button onClick={(e) => { e.stopPropagation(); onCancel(); }} className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors keep-bg">
        <svg className="w-3 h-3 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <div className="flex items-center justify-center gap-[2px] flex-1 mx-1">
        {[...Array(8)].map((_, i) => {
          const centerDist = Math.abs(i - 3.5) / 3.5;
          const baseHeight = 3;
          const maxHeight = 12;
          const height = baseHeight + (maxHeight - baseHeight) * normalizedLevel * (1 - centerDist * 0.4) * (0.6 + Math.random() * 0.4);
          return <motion.div key={i} className="w-[2px] rounded-full bg-blue-400 keep-bg" animate={{ height }} transition={{ duration: 0.05 }} />;
        })}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onStop(); }} className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors keep-bg">
        <div className="w-2 h-2 rounded-sm bg-white keep-bg" />
      </button>
    </motion.div>
  );
}

function ProcessingPill() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-[2px] px-2">
      {[...Array(6)].map((_, i) => (
        <motion.div key={i} className="w-[2px] rounded-full bg-white/60 keep-bg" animate={{ height: [3, 8, 3] }} transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.06 }} />
      ))}
    </motion.div>
  );
}

function SuccessPill() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-[2px] px-2">
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="w-[2px] rounded-full bg-green-400 keep-bg"
          animate={{ height: [3, 8, 3] }}
          transition={{ duration: 0.35, repeat: Infinity, delay: i * 0.03 }}
        />
      ))}
    </motion.div>
  );
}

function ErrorPill() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-[2px] px-2">
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="w-[2px] rounded-full bg-red-400 keep-bg"
          animate={{ height: [3, 10, 3] }}
          transition={{ duration: 0.45, repeat: Infinity, delay: i * 0.04 }}
        />
      ))}
    </motion.div>
  );
}
