"use client";

import { getGreeting } from "@/lib/utils";
import { StatsBar } from "./StatsBar";

interface GreetingCardProps {
  streak?: number;
  totalWords?: number;
  todayWords?: number;
}

export function GreetingCard({
  streak = 0,
  totalWords = 0,
  todayWords = 0,
}: GreetingCardProps) {
  const greeting = getGreeting();

  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold text-foreground">
        {greeting}
      </h1>
      <StatsBar streak={streak} totalWords={totalWords} todayWords={todayWords} />
    </div>
  );
}

