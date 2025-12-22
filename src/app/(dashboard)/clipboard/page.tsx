"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  isTauri,
  getClipboard,
  setClipboard,
  getClipboardHistory,
  type ClipboardEntry,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";

export default function ClipboardPage() {
  const [currentContent, setCurrentContent] = useState("");
  const [history, setHistory] = useState<ClipboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (isTauri()) {
      loadClipboard();
    } else {
      setIsLoading(false);
    }
  }, []);

  const loadClipboard = async () => {
    setIsLoading(true);
    try {
      const [content, hist] = await Promise.all([
        getClipboard(),
        getClipboardHistory(20),
      ]);
      setCurrentContent(content);
      setHistory(hist);
    } catch (error) {
      console.error("Failed to load clipboard:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyToClipboard = async (content: string) => {
    try {
      await setClipboard(content);
      setCurrentContent(content);
    } catch (error) {
      console.error("Failed to set clipboard:", error);
    }
  };

  const formatAsListLocal = (text: string): string => {
    return text
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => `• ${l.trim()}`)
      .join("\n");
  };

  const formatAsNumberedListLocal = (text: string): string => {
    return text
      .split("\n")
      .filter((l) => l.trim())
      .map((l, i) => `${i + 1}. ${l.trim()}`)
      .join("\n");
  };

  const cleanTextLocal = (text: string): string => {
    return text
      .replace(/\s+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();
  };

  const handleQuickAction = async (action: string) => {
    if (!currentContent.trim()) return;

    setProcessing(action);
    try {
      let result = currentContent;
      
      switch (action) {
        case "bullet":
          result = formatAsListLocal(currentContent);
          break;
        case "numbered":
          result = formatAsNumberedListLocal(currentContent);
          break;
        case "clean":
          result = cleanTextLocal(currentContent);
          break;
        case "uppercase":
          result = currentContent.toUpperCase();
          break;
        case "lowercase":
          result = currentContent.toLowerCase();
          break;
        case "titlecase":
          result = currentContent
            .toLowerCase()
            .split(" ")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
          break;
      }

      await setClipboard(result);
      setCurrentContent(result);
    } catch (error) {
      console.error("Failed to process clipboard:", error);
    } finally {
      setProcessing(null);
    }
  };

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch {
      return "";
    }
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case "Url":
        return (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        );
      case "Email":
        return (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        );
      case "Code":
        return (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        );
      case "List":
        return (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        );
      default:
        return (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clipboard Tools</h1>
          <p className="text-sm text-muted">
            Format, transform, and manage your clipboard content
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border">
          <button
            onClick={() => setActiveTab("current")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              activeTab === "current"
                ? "border-b-2 border-primary text-primary"
                : "text-muted hover:text-foreground"
            )}
          >
            Current Clipboard
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              activeTab === "history"
                ? "border-b-2 border-primary text-primary"
                : "text-muted hover:text-foreground"
            )}
          >
            History ({history.length})
          </button>
        </div>

        {activeTab === "current" ? (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Current Content */}
            <div className="lg:col-span-2">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-medium text-foreground">Clipboard Content</h3>
                  <button
                    onClick={loadClipboard}
                    className="rounded-lg p-2 text-muted hover:bg-sidebar-hover hover:text-foreground"
                    title="Refresh"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
                {isLoading ? (
                  <div className="flex h-48 items-center justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : (
                  <textarea
                    value={currentContent}
                    onChange={(e) => setCurrentContent(e.target.value)}
                    placeholder="Clipboard is empty. Copy some text to see it here."
                    className="h-48 w-full resize-none rounded-lg border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                )}
                <div className="mt-3 flex items-center justify-between text-xs text-muted">
                  <span>
                    {currentContent.split(/\s+/).filter(Boolean).length} words,{" "}
                    {currentContent.length} characters
                  </span>
                  <button
                    onClick={() => handleCopyToClipboard(currentContent)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-sidebar-hover"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    Update Clipboard
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div>
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-4 font-medium text-foreground">Quick Actions</h3>
                <div className="space-y-2">
                  {[
                    { id: "bullet", label: "Bullet List", icon: "•" },
                    { id: "numbered", label: "Numbered List", icon: "1." },
                    { id: "clean", label: "Clean Up Text", icon: "✨" },
                    { id: "uppercase", label: "UPPERCASE", icon: "AA" },
                    { id: "lowercase", label: "lowercase", icon: "aa" },
                    { id: "titlecase", label: "Title Case", icon: "Aa" },
                  ].map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleQuickAction(action.id)}
                      disabled={!currentContent.trim() || processing !== null}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        currentContent.trim()
                          ? "hover:bg-sidebar-hover"
                          : "cursor-not-allowed opacity-50"
                      )}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-medium text-primary">
                        {processing === action.id ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        ) : (
                          action.icon
                        )}
                      </span>
                      <span className="text-foreground">{action.label}</span>
                    </button>
                  ))}
                </div>

                <div className="mt-4 border-t border-border pt-4">
                  <h4 className="mb-2 text-xs font-medium uppercase text-muted">
                    Voice Commands
                  </h4>
                  <p className="text-xs text-muted">
                    Try saying: &quot;Format my clipboard as a bullet list&quot; or &quot;Translate clipboard to Spanish&quot;
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* History Tab */
          <div className="rounded-xl border border-border bg-card">
            {history.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-center">
                <div className="mb-4 rounded-full bg-primary/10 p-4">
                  <svg className="h-8 w-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h3 className="mb-1 font-medium text-foreground">No clipboard history</h3>
                <p className="text-sm text-muted">
                  Your clipboard history will appear here
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-4 p-4 hover:bg-sidebar-hover/50"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {getContentTypeIcon(entry.content_type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">
                        {truncateText(entry.content, 100)}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                        <span>{entry.word_count} words</span>
                        <span>{entry.char_count} chars</span>
                        <span>{formatTime(entry.timestamp)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleCopyToClipboard(entry.content)}
                      className="shrink-0 rounded-lg p-2 text-muted hover:bg-sidebar-hover hover:text-foreground"
                      title="Copy to clipboard"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
