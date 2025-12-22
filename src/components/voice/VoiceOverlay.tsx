"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  isTauri,
  startListening,
  stopListening,
  onShortcutPressed,
  onShortcutReleased,
  type VoiceProcessingResult,
} from "@/lib/tauri";

interface VoiceOverlayProps {
  onTranscriptionComplete?: (result: VoiceProcessingResult) => void;
}

export function VoiceOverlay({
  onTranscriptionComplete,
}: VoiceOverlayProps) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [lastResult, setLastResult] = useState<VoiceProcessingResult | null>(null);

  const isActiveRef = useRef(false);

  // Start listening - backend handles native audio capture
  const handleStartListening = useCallback(async () => {
    if (isActiveRef.current) {
      console.log("[VoiceOverlay] Already active, ignoring");
      return;
    }
    
    isActiveRef.current = true;
    setIsListening(true);
    setStatusText("Listening...");
    setLastResult(null);

    try {
      console.log("[VoiceOverlay] Starting native audio recording...");
      await startListening();
      console.log("[VoiceOverlay] Native audio recording started");
    } catch (error) {
      console.error("[VoiceOverlay] Failed to start listening:", error);
      isActiveRef.current = false;
      setIsListening(false);
      setStatusText("");
    }
  }, []);

  // Stop listening - backend processes audio and executes action
  const handleStopListening = useCallback(async () => {
    if (!isActiveRef.current) {
      console.log("[VoiceOverlay] Not active, ignoring stop");
      return;
    }
    
    isActiveRef.current = false;
    setIsListening(false);
    setIsProcessing(true);
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
      
      if (result.transcription.text) {
        setStatusText(`"${result.transcription.text}"`);
        onTranscriptionComplete?.(result);
        
        // Show result briefly then hide
        setTimeout(() => {
          setStatusText("");
        }, 2000);
      } else {
        setStatusText("No speech detected");
        setTimeout(() => {
          setStatusText("");
        }, 1500);
      }
    } catch (error) {
      console.error("[VoiceOverlay] Error processing:", error);
      setStatusText("Error processing");
      setTimeout(() => {
        setStatusText("");
      }, 1500);
    } finally {
      setIsProcessing(false);
    }
  }, [onTranscriptionComplete]);

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
    };
  }, [handleStartListening, handleStopListening]);

  // Show overlay when listening or processing
  const showOverlay = isListening || isProcessing || statusText !== "";

  return (
    <AnimatePresence>
      {showOverlay && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.1 }}
          className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2"
        >
          <div className="flex flex-col items-center gap-3 rounded-xl bg-card/90 px-8 py-6 shadow-xl backdrop-blur-sm min-w-[200px]">
            {isProcessing ? (
              // Processing spinner
              <div className="flex h-8 w-8 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : isListening ? (
              // Waveform animation for listening
              <div className="flex h-8 items-center gap-1">
                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-1 rounded-full bg-primary"
                    animate={{ height: [8, 24, 8] }}
                    transition={{
                      duration: 0.6,
                      repeat: Infinity,
                      delay: i * 0.08,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
            ) : lastResult?.executed ? (
              // Success checkmark
              <div className="flex h-8 w-8 items-center justify-center text-green-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : null}
            
            <p className="text-sm font-medium text-foreground text-center max-w-xs">
              {isListening ? "Listening..." : 
               isProcessing ? "Processing..." : 
               statusText}
            </p>
            
            {lastResult && !isListening && !isProcessing && (
              <p className="text-xs text-muted-foreground">
                Action: {lastResult.action.action_type}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
