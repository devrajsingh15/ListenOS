"use client";

import { FireIcon, Rocket01Icon, Timer02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

interface StatsBarProps {
  streak: number;
  totalWords: number;
  wpm: number;
}

export function StatsBar({ streak, totalWords, wpm }: StatsBarProps) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5">
        <HugeiconsIcon icon={FireIcon} size={18} className="text-orange-500" />
        <span className="font-medium text-foreground">{streak} weeks</span>
      </div>
      <span className="text-border">|</span>
      <div className="flex items-center gap-1.5">
        <HugeiconsIcon icon={Rocket01Icon} size={18} className="text-pink-500" />
        <span className="font-medium text-foreground">{totalWords.toLocaleString()} words</span>
      </div>
      <span className="text-border">|</span>
      <div className="flex items-center gap-1.5">
        <HugeiconsIcon icon={Timer02Icon} size={18} className="text-amber-600" />
        <span className="font-medium text-foreground">{wpm} WPM</span>
      </div>
    </div>
  );
}

