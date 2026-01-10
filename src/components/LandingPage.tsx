"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";

export function LandingPage() {
  const { signIn } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleSignIn = () => {
    setIsSigningIn(true);
    signIn();
    // Reset after a delay in case user cancels
    setTimeout(() => setIsSigningIn(false), 5000);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="ListenOS"
              width={28}
              height={28}
              className="h-7 w-7"
            />
            <span className="text-lg font-semibold text-foreground">ListenOS</span>
          </div>
          <button
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="px-4 py-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
          >
            {isSigningIn ? "Opening..." : "Sign In"}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          {/* Logo Animation */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="mb-6 flex justify-center"
          >
            <div className="relative">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
                <Image
                  src="/logo.svg"
                  alt="ListenOS"
                  width={40}
                  height={40}
                  className="h-10 w-10"
                />
              </div>
              {/* Pulse effect */}
              <motion.div
                className="absolute inset-0 rounded-2xl bg-primary/20"
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="text-2xl font-bold text-foreground mb-2"
          >
            Welcome to ListenOS
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.3 }}
            className="text-muted text-sm mb-8"
          >
            AI-powered voice control for your computer
          </motion.p>

          {/* Sign In Button */}
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.3 }}
          >
            <button
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="w-full py-3 px-6 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSigningIn ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Opening browser...</span>
                </>
              ) : (
                <>
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  <span>Sign In to Get Started</span>
                </>
              )}
            </button>
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.3 }}
            className="mt-8 grid grid-cols-3 gap-4"
          >
            <FeatureItem icon="🎤" label="Voice Control" />
            <FeatureItem icon="⚡" label="Instant Actions" />
            <FeatureItem icon="🔒" label="Secure" />
          </motion.div>

          {/* Skip for now (offline mode) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.3 }}
            className="mt-6"
          >
            <OfflineModeButton />
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center">
        <p className="text-xs text-muted">
          © 2025 EvidentSphere. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

function FeatureItem({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-card/50">
      <span className="text-xl">{icon}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

function OfflineModeButton() {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleOfflineMode = () => {
    // Set a flag to skip auth and use offline mode
    localStorage.setItem("listenos_offline_mode", "true");
    // Trigger a fake auth to show the dashboard
    localStorage.setItem("listenos_user", JSON.stringify({
      id: "offline",
      email: "offline@local",
      firstName: "Offline",
      lastName: "User",
    }));
    window.location.reload();
  };

  if (showConfirm) {
    return (
      <div className="text-center">
        <p className="text-xs text-muted mb-2">
          Offline mode has limited features. Continue?
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => setShowConfirm(false)}
            className="px-3 py-1 text-xs text-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleOfflineMode}
            className="px-3 py-1 text-xs text-primary hover:text-primary/80"
          >
            Use Offline
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowConfirm(true)}
      className="text-xs text-muted hover:text-foreground transition-colors"
    >
      Continue without signing in →
    </button>
  );
}
