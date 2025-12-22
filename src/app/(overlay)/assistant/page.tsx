"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  isTauri,
  startListening,
  stopListening,
  onShortcutPressed,
  onShortcutReleased,
  hideAssistant,
} from "@/lib/tauri";

export default function AssistantPage() {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(12).fill(0.1));
  const [mounted, setMounted] = useState(false);

  const listeningRef = useRef(false);
  const processingRef = useRef(false);

  // Only run on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Keep refs in sync
  useEffect(() => {
    listeningRef.current = listening;
    processingRef.current = processing;
  }, [listening, processing]);

  // Animate audio levels when listening
  useEffect(() => {
    if (listening) {
      const interval = setInterval(() => {
        setAudioLevels(prev => prev.map(() => Math.random() * 0.7 + 0.3));
      }, 80);
      return () => clearInterval(interval);
    } else {
      setAudioLevels(Array(12).fill(0.1));
    }
  }, [listening]);

  const start = useCallback(async () => {
    if (listeningRef.current || processingRef.current) return;
    try {
      setDone(false);
      await startListening();
      setListening(true);
    } catch (e) {
      console.warn("Start listening failed:", e);
    }
  }, []);

  const stop = useCallback(async () => {
    if (!listeningRef.current) return;
    setListening(false);
    setProcessing(true);
    try {
      await stopListening();
      setDone(true);
      setTimeout(() => {
        if (isTauri()) hideAssistant().catch(() => {});
      }, 600);
    } catch (e) {
      console.warn("Stop listening failed:", e);
      if (isTauri()) hideAssistant().catch(() => {});
    } finally {
      setProcessing(false);
    }
  }, []);

  // Set up event listeners
  useEffect(() => {
    if (!mounted || !isTauri()) return;

    let unlistenPressed: (() => void) | undefined;
    let unlistenReleased: (() => void) | undefined;
    let cancelled = false;

    const setup = async () => {
      try {
        unlistenPressed = await onShortcutPressed(() => {
          if (!listeningRef.current && !processingRef.current) start();
        });
        unlistenReleased = await onShortcutReleased(() => {
          if (listeningRef.current) stop();
        });
      } catch (e) {
        console.warn("Failed to setup event listeners:", e);
      }
    };

    setup();
    return () => { 
      cancelled = true;
      unlistenPressed?.(); 
      unlistenReleased?.(); 
    };
  }, [mounted, start, stop]);

  return (
    <div 
      className="h-full w-full flex items-center justify-center"
      style={{ background: 'transparent' }}
    >
      {/* Listening - Rainbow waveform bars (no container bg) */}
      {listening && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-1 h-8"
        >
          {audioLevels.map((level, i) => {
            const hue = (i * 30 + Date.now() / 50) % 360;
            return (
              <motion.div
                key={i}
                className="w-1.5 rounded-full"
                animate={{ height: `${level * 100}%`, opacity: 0.8 + level * 0.2 }}
                transition={{ duration: 0.08, ease: "easeOut" }}
                style={{ 
                  minHeight: 4, 
                  maxHeight: 32, 
                  background: `hsl(${hue}, 100%, 60%)`, 
                  boxShadow: `0 0 8px hsl(${hue}, 100%, 50%)` 
                }}
              />
            );
          })}
        </motion.div>
      )}

      {/* Processing - Spinner in a pill (with rounded bg) */}
      {processing && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center justify-center px-4 py-2 rounded-full backdrop-blur-sm keep-bg"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        >
          <motion.div 
            className="w-5 h-5 rounded-full border-2 border-cyan-400 border-t-transparent"
            style={{ background: 'transparent' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}
          />
        </motion.div>
      )}

      {/* Done - Checkmark in a pill (with rounded bg) */}
      {done && !processing && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
          className="flex items-center justify-center px-4 py-2 rounded-full shadow-lg keep-bg"
          style={{ backgroundColor: 'rgb(34, 197, 94)', boxShadow: '0 10px 15px -3px rgba(34, 197, 94, 0.5)' }}
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>
      )}
    </div>
  );
}
