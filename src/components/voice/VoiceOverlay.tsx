"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  isTauri,
  startListening,
  stopListening,
  playTtsFromBase64,
  speakWithFallbackTts,
  onShortcutPressed,
  onShortcutReleased,
  type VoiceProcessingResult,
} from "@/lib/tauri";

interface VoiceOverlayProps {
  onTranscriptionComplete?: (result: VoiceProcessingResult) => void;
}

type OverlayState = "idle" | "listening" | "processing" | "response" | "success" | "error";

export function VoiceOverlay({
  onTranscriptionComplete,
}: VoiceOverlayProps) {
  const [state, setState] = useState<OverlayState>("idle");
  const [statusText, setStatusText] = useState("");
  const [responseText, setResponseText] = useState("");
  const [actionType, setActionType] = useState("");
  const [lastResult, setLastResult] = useState<VoiceProcessingResult | null>(null);
  const [showQuickActions, setShowQuickActions] = useState(false);

  const isActiveRef = useRef(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear hide timeout
  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  // Schedule hide
  const scheduleHide = useCallback((delay: number) => {
    clearHideTimeout();
    hideTimeoutRef.current = setTimeout(() => {
      setState("idle");
      setStatusText("");
      setResponseText("");
      setActionType("");
      setShowQuickActions(false);
    }, delay);
  }, [clearHideTimeout]);

  // Start listening - backend handles native audio capture
  const handleStartListening = useCallback(async () => {
    if (isActiveRef.current) {
      console.log("[VoiceOverlay] Already active, ignoring");
      return;
    }
    
    clearHideTimeout();
    isActiveRef.current = true;
    setState("listening");
    setStatusText("Listening...");
    setLastResult(null);
    setResponseText("");
    setActionType("");
    setShowQuickActions(false);

    try {
      console.log("[VoiceOverlay] Starting native audio recording...");
      await startListening();
      console.log("[VoiceOverlay] Native audio recording started");
    } catch (error) {
      console.error("[VoiceOverlay] Failed to start listening:", error);
      isActiveRef.current = false;
      setState("error");
      setStatusText("Failed to start");
      scheduleHide(2000);
    }
  }, [clearHideTimeout, scheduleHide]);

  // Stop listening - backend processes audio and executes action
  const handleStopListening = useCallback(async () => {
    if (!isActiveRef.current) {
      console.log("[VoiceOverlay] Not active, ignoring stop");
      return;
    }
    
    isActiveRef.current = false;
    setState("processing");
    setStatusText("Processing...");

    try {
      console.log("[VoiceOverlay] Stopping and processing audio...");
      
      // Add timeout to prevent infinite processing
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Processing timeout')), 15000)
      );

      const result = await Promise.race([
        stopListening(),
        timeoutPromise
      ]);
      
      console.log("[VoiceOverlay] Result:", result);
      
      setLastResult(result);
      setActionType(result.action.action_type);

      const ttsBase64 = typeof result.action?.payload?.tts_base64 === "string"
        ? result.action.payload.tts_base64
        : null;
      if (ttsBase64) {
        void playTtsFromBase64(ttsBase64).catch((err) => {
          console.warn("[VoiceOverlay] Failed to play TTS audio:", err);
        });
      } else {
        const fallbackSpeech = result.response_text || result.action?.response_text;
        if (typeof fallbackSpeech === "string" && fallbackSpeech.trim().length > 0) {
          speakWithFallbackTts(fallbackSpeech);
        }
      }
      
      // Check if this is a conversational response
      const isConversational = result.action.action_type === "Respond" || 
                               result.action.action_type === "Clarify";
      
      if (result.transcription.text) {
        setStatusText(`"${result.transcription.text}"`);
        onTranscriptionComplete?.(result);
        
        if (isConversational && result.response_text) {
          // Show AI response
          setState("response");
          setResponseText(result.response_text);
          setShowQuickActions(true);
          scheduleHide(8000); // Longer time for reading response
        } else if (result.executed) {
          setState("success");
          scheduleHide(2500);
        } else {
          const executionError = typeof result.action?.payload?.execution_error === "string"
            ? result.action.payload.execution_error
            : null;
          setStatusText(executionError || result.response_text || "Action failed");
          setState("error");
          scheduleHide(3200);
        }
      } else if (result.action.action_type === "NoAction") {
        // Silent dismissal for filtered hallucinations
        console.log("[VoiceOverlay] Silent dismissal (NoAction)");
        setState("idle");
        scheduleHide(0);
      } else {
        setState("error");
        setStatusText("No speech detected");
        scheduleHide(1500);
      }
    } catch (error) {
      console.error("[VoiceOverlay] Error processing:", error);
      setState("error");
      setStatusText("Error processing");
      scheduleHide(2000);
    }
  }, [onTranscriptionComplete, scheduleHide]);

  // Set up Tauri event listeners for global shortcut
  useEffect(() => {
    if (!isTauri()) {
      console.log("[VoiceOverlay] Not running in Tauri, voice overlay disabled");
      return;
    }

    let unlistenPressed: (() => void) | undefined;
    let unlistenReleased: (() => void) | undefined;

    const setupListeners = async () => {
      console.log("[VoiceOverlay] Setting up event listeners...");
      unlistenPressed = await onShortcutPressed(() => {
        console.log("[VoiceOverlay] shortcut-pressed event received!");
        handleStartListening();
      });
      unlistenReleased = await onShortcutReleased(() => {
        console.log("[VoiceOverlay] shortcut-released event received!");
        handleStopListening();
      });
      console.log("[VoiceOverlay] Ready - press Ctrl+Space to start");
    };

    setupListeners();

    return () => {
      unlistenPressed?.();
      unlistenReleased?.();
      clearHideTimeout();
    };
  }, [handleStartListening, handleStopListening, clearHideTimeout]);

  // Show overlay when not idle
  const showOverlay = state !== "idle";

  // Get the appropriate icon based on state
  const renderIcon = () => {
    switch (state) {
      case "listening":
        return (
          <div className="flex h-10 items-center gap-1">
            {[...Array(12)].map((_, i) => (
              <motion.div
                key={i}
                className="w-1 rounded-full bg-primary keep-bg"
                animate={{ height: [8, 28, 8] }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.08,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
        );
      case "processing":
        return (
          <div className="flex h-10 w-10 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        );
      case "success":
        return (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20 keep-bg"
          >
            <svg className="h-6 w-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </motion.div>
        );
      case "error":
        return (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20 keep-bg"
          >
            <svg className="h-6 w-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </motion.div>
        );
      case "response":
        return (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 keep-bg"
          >
            <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </motion.div>
        );
      default:
        return null;
    }
  };

  // Get action type display name
  const getActionDisplay = (type: string) => {
    const actionMap: Record<string, { icon: string; label: string }> = {
      TypeText: { icon: "⌨️", label: "Typed" },
      OpenApp: { icon: "🖥️", label: "Opened App" },
      OpenUrl: { icon: "🌐", label: "Opened URL" },
      WebSearch: { icon: "🔍", label: "Searched" },
      VolumeControl: { icon: "🔊", label: "Volume" },
      SendEmail: { icon: "📧", label: "Email" },
      Respond: { icon: "💬", label: "Response" },
      Clarify: { icon: "❓", label: "Question" },
      SpotifyControl: { icon: "🎵", label: "Spotify" },
      DiscordControl: { icon: "💬", label: "Discord" },
      SystemControl: { icon: "⚙️", label: "System" },
      ClipboardFormat: { icon: "📋", label: "Clipboard" },
      ClipboardTranslate: { icon: "🌍", label: "Translated" },
      ClipboardSummarize: { icon: "📝", label: "Summarized" },
    };
    return actionMap[type] || { icon: "✓", label: type };
  };

  return (
    <AnimatePresence>
      {showOverlay && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2"
        >
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-card/95 px-8 py-6 backdrop-blur-md min-w-[280px] max-w-[400px] border border-border/50 keep-bg">
            {/* Icon */}
            {renderIcon()}
            
            {/* Action badge */}
            {(state === "success" || state === "response") && actionType && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-full bg-sidebar-bg px-3 py-1 keep-bg"
              >
                <span>{getActionDisplay(actionType).icon}</span>
                <span className="text-xs text-muted">
                  {getActionDisplay(actionType).label}
                </span>
              </motion.div>
            )}

            {/* Quick actions */}
            {showQuickActions && lastResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex gap-2 pt-2 border-t border-border/50 w-full justify-center"
              >
                <button
                  onClick={() => {
                    clearHideTimeout();
                    scheduleHide(0);
                  }}
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted hover:bg-sidebar-hover hover:text-foreground transition-colors"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Dismiss
                </button>
                <button
                  onClick={() => {
                    clearHideTimeout();
                    handleStartListening();
                  }}
                  className="flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs text-primary hover:bg-primary/20 transition-colors keep-bg"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  Continue
                </button>
              </motion.div>
            )}

            {/* Keyboard hint when listening */}
            {state === "listening" && (
              <p className="text-xs text-muted">
                Release <kbd className="rounded bg-sidebar-bg px-1.5 py-0.5 font-mono text-[10px] keep-bg">Ctrl+Space</kbd> when done
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
