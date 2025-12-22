"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { cn } from "@/lib/utils";
import { Add01Icon, Search01Icon, FilterIcon, RefreshIcon, Cancel01Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type TabType = "all" | "personal" | "shared";

interface DictionaryWord {
  id: string;
  word: string;
  isAutoLearned?: boolean;
}

const sampleWords: DictionaryWord[] = [
  { id: "1", word: "github", isAutoLearned: true },
  { id: "2", word: "dsmahar07@gmail.com", isAutoLearned: false },
  { id: "3", word: "Devraj", isAutoLearned: false },
  { id: "4", word: "Mono", isAutoLearned: true },
  { id: "5", word: "Bun", isAutoLearned: true },
];

export default function DictionaryPage() {
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [showTip, setShowTip] = useState(true);

  const tabs: { id: TabType; label: string }[] = [
    { id: "all", label: "All" },
    { id: "personal", label: "Personal" },
    { id: "shared", label: "Shared with team" },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Dictionary</h1>
          <button className="flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-foreground/90">
            <HugeiconsIcon icon={Add01Icon} size={16} />
            Add new
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-between border-b border-border">
          <div className="flex gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "border-b-2 pb-3 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pb-3">
            <button className="rounded-lg p-2 text-muted transition-colors hover:bg-sidebar-hover hover:text-foreground">
              <HugeiconsIcon icon={Search01Icon} size={18} />
            </button>
            <button className="rounded-lg p-2 text-muted transition-colors hover:bg-sidebar-hover hover:text-foreground">
              <HugeiconsIcon icon={FilterIcon} size={18} />
            </button>
            <button className="rounded-lg p-2 text-muted transition-colors hover:bg-sidebar-hover hover:text-foreground">
              <HugeiconsIcon icon={RefreshIcon} size={18} />
            </button>
          </div>
        </div>

        {/* Feature Tip */}
        {showTip && (
          <div className="relative rounded-xl bg-card-feature p-6">
            <button
              onClick={() => setShowTip(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-muted transition-colors hover:bg-white/50 hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={18} />
            </button>
            <h2 className="mb-2 text-xl font-semibold text-foreground">
              Flow speaks the way you speak.
            </h2>
            <p className="mb-4 text-sm text-muted">
              ListenOS learns your unique words and names — automatically or manually.{" "}
              <span className="font-medium text-foreground">
                Add personal terms, company jargon, client names, or industry-specific lingo
              </span>
              . Share them with your team so everyone stays on the same page.
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              {["Q3 Roadmap", "Whispr → Wispr", "SF MOMA", "Figma Jam", "Company name"].map(
                (example) => (
                  <span
                    key={example}
                    className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-foreground"
                  >
                    {example}
                  </span>
                )
              )}
            </div>
            <button className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-foreground/90">
              Add new word
            </button>
          </div>
        )}

        {/* Word List */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {sampleWords.map((word, index) => (
            <div
              key={word.id}
              className={cn(
                "flex items-center justify-between px-6 py-4 transition-colors hover:bg-sidebar-hover",
                index !== sampleWords.length - 1 && "border-b border-border"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground">{word.word}</span>
                {word.isAutoLearned && (
                  <HugeiconsIcon icon={SparklesIcon} size={16} className="text-amber-500" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

