"use client";

import { useEffect, useState } from "react";
import { GreetingCard } from "./GreetingCard";
import { FeatureTip } from "./FeatureTip";
import { ActivityTable } from "./ActivityTable";
import { isTauri, getConversation } from "@/lib/tauri";

interface DashboardStats {
  totalWords: number;
  todayWords: number;
  streak: number;
}

function calculateStats(messages: Array<{ role: string; content: string; timestamp: string }>): DashboardStats {
  const now = new Date();
  const today = now.toDateString();
  
  let totalWords = 0;
  let todayWords = 0;
  const daysWithActivity = new Set<string>();
  
  // Only count user messages (dictation)
  const userMessages = messages.filter(m => m.role === "User");
  
  for (const msg of userMessages) {
    const wordCount = msg.content.trim().split(/\s+/).filter(w => w.length > 0).length;
    totalWords += wordCount;
    
    const msgDate = new Date(msg.timestamp);
    const msgDateStr = msgDate.toDateString();
    daysWithActivity.add(msgDateStr);
    
    if (msgDateStr === today) {
      todayWords += wordCount;
    }
  }
  
  // Calculate streak (consecutive days including today)
  let streak = 0;
  const checkDate = new Date(now);
  
  while (true) {
    if (daysWithActivity.has(checkDate.toDateString())) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  
  return { totalWords, todayWords, streak };
}

export function DashboardContent() {
  const [stats, setStats] = useState<DashboardStats>({ totalWords: 0, todayWords: 0, streak: 0 });
  
  useEffect(() => {
    if (!isTauri()) return;
    
    const loadStats = async () => {
      try {
        const messages = await getConversation();
        setStats(calculateStats(messages));
      } catch (err) {
        console.error("Failed to load stats:", err);
      }
    };
    
    loadStats();
    // Refresh stats every 5 seconds
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="space-y-8">
      {/* Greeting & Stats */}
      <GreetingCard
        streak={stats.streak}
        totalWords={stats.totalWords}
        todayWords={stats.todayWords}
      />

      {/* Feature Tip */}
      <FeatureTip
        title="Hold Ctrl+Space to dictate and let ListenOS format for you"
        description="Press and hold Ctrl+Space to dictate in any app. ListenOS's Smart Formatting and Backtrack will handle punctuation, new lines, lists, and adjust when you change your mind mid-sentence."
      />

      {/* Activity Table */}
      <ActivityTable />
    </div>
  );
}

