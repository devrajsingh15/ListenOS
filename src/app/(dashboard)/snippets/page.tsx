"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { cn } from "@/lib/utils";
import { Add01Icon, Search01Icon, FilterIcon, RefreshIcon, Cancel01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type TabType = "all" | "personal" | "shared";

interface Snippet {
  id: string;
  trigger: string;
  expansion: string;
}

const sampleSnippets: Snippet[] = [
  {
    id: "1",
    trigger: "my Flow referral",
    expansion: "Hey, use my referral link to get 1 month off Wispr Flow! https://wisprflow.ai/referra...",
  },
  {
    id: "2",
    trigger: "my email address",
    expansion: "dsmahar07@gmail.com",
  },
  {
    id: "3",
    trigger: "organize thoughts prompt",
    expansion: "Organize these unstructured thoughts into a clear, polished version wi...",
  },
];

const exampleSnippets = [
  { trigger: "Linkedin", expansion: "https://www.linkedin.com/in/john-doe-9b0139134/" },
  { trigger: "intro email", expansion: "Hey, would love to find some time to chat later..." },
  { trigger: "my calendly link", expansion: "calendly.com/you/invite-name" },
];

export default function SnippetsPage() {
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
          <h1 className="text-2xl font-semibold text-foreground">Snippets</h1>
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
              The stuff you shouldn&apos;t have to re-type.
            </h2>
            <p className="mb-4 text-sm text-muted">
              Save shortcuts to speak the things you type all the time—emails, links, addresses,
              bios—anything.{" "}
              <span className="font-medium text-foreground">
                Just speak and ListenOS expands them instantly
              </span>
              , without retyping or hunting through old messages.
            </p>
            <div className="mb-4 space-y-2">
              {exampleSnippets.map((snippet) => (
                <div key={snippet.trigger} className="flex items-center gap-3">
                  <span className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-foreground">
                    {snippet.trigger}
                  </span>
                  <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="text-muted" />
                  <span className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm text-foreground">
                    {snippet.expansion}
                  </span>
                </div>
              ))}
            </div>
            <button className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-foreground/90">
              Add new snippet
            </button>
          </div>
        )}

        {/* Snippet List */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {sampleSnippets.map((snippet, index) => (
            <div
              key={snippet.id}
              className={cn(
                "flex items-center gap-3 px-6 py-4 transition-colors hover:bg-sidebar-hover",
                index !== sampleSnippets.length - 1 && "border-b border-border"
              )}
            >
              <span className="text-sm font-medium text-foreground">{snippet.trigger}</span>
              <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="text-muted" />
              <span className="text-sm text-muted">{snippet.expansion}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

