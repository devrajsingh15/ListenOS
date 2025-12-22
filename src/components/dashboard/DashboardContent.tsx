"use client";

import { GreetingCard } from "./GreetingCard";
import { FeatureTip } from "./FeatureTip";
import { ActivityTable } from "./ActivityTable";
import { useTranscription } from "@/context/TranscriptionContext";

export function DashboardContent() {
  const { activities, totalWords } = useTranscription();

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

      {/* Activity Table */}
      <ActivityTable entries={activities} />
    </div>
  );
}

