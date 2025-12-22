"use client";

import { getGreeting } from "@/lib/utils";
import { StatsBar } from "./StatsBar";

interface GreetingCardProps {
  userName: string;
  streak?: number;
  totalWords?: number;
  wpm?: number;
}

export function GreetingCard({
  userName,
  streak = 2,
  totalWords = 8077,
  wpm = 141,
}: GreetingCardProps) {
  const greeting = getGreeting();

  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold text-foreground">
        {greeting}, {userName}
      </h1>
      <StatsBar streak={streak} totalWords={totalWords} wpm={wpm} />
    </div>
  );
}

