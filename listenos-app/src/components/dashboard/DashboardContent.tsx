"use client";

import { useRef, useEffect } from "react";
import { GreetingCard } from "./GreetingCard";
import { FeatureTip } from "./FeatureTip";
import { ActivityTable } from "./ActivityTable";
import { useTranscription } from "@/context/TranscriptionContext";

export function DashboardContent() {
  const { activities, totalWords } = useTranscription();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Listen for input events to sync uncontrolled input
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleInput = () => {
      // Force re-render if needed
    };

    textarea.addEventListener("input", handleInput);
    return () => textarea.removeEventListener("input", handleInput);
  }, []);

  return (
    <div className="space-y-8">
      {/* Greeting & Stats */}
      <GreetingCard
        userName="Devraj"
        streak={2}
        totalWords={totalWords}
        wpm={141}
      />

      {/* Feature Tip */}
      <FeatureTip
        title="Hold Ctrl+Space to dictate and let ListenOS format for you"
        description="Press and hold Ctrl+Space to dictate in any app. ListenOS's Smart Formatting and Backtrack will handle punctuation, new lines, lists, and adjust when you change your mind mid-sentence."
      />

      {/* Test Input Field */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Test Voice Input</h3>
        <p className="mb-4 text-sm text-muted">
          Click in the text area below, then hold <kbd className="rounded bg-sidebar-bg px-1.5 py-0.5 text-xs font-medium">Ctrl+Space</kbd> to dictate. 
          For dictation, text will be pasted here. For commands, a toast will appear.
        </p>
        <textarea
          ref={textareaRef}
          defaultValue=""
          placeholder="Click here, then hold Ctrl+Space to speak..."
          className="w-full rounded-lg border border-border bg-background p-4 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          rows={4}
        />
      </div>

      {/* Activity Table */}
      <ActivityTable entries={activities} />
    </div>
  );
}

