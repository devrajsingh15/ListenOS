"use client";

import { FireIcon, Rocket01Icon, Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

interface StatsBarProps {
  streak: number;
  totalWords: number;
  todayWords: number;
}

export function StatsBar({ streak, totalWords, todayWords }: StatsBarProps) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5">
        <HugeiconsIcon icon={FireIcon} size={18} className="text-orange-500" />
        <span className="font-medium text-foreground">{streak} day{streak !== 1 ? 's' : ''} streak</span>
      </div>
      <span className="text-border">|</span>
      <div className="flex items-center gap-1.5">
        <HugeiconsIcon icon={Rocket01Icon} size={18} className="text-pink-500" />
        <span className="font-medium text-foreground">{totalWords.toLocaleString()} total words</span>
      </div>
      <span className="text-border">|</span>
      <div className="flex items-center gap-1.5">
        <HugeiconsIcon icon={Calendar03Icon} size={18} className="text-blue-500" />
        <span className="font-medium text-foreground">{todayWords.toLocaleString()} today</span>
      </div>
    </div>
  );
}

