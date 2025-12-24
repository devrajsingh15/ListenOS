"use client";

import { useState, useEffect } from "react";
import { isTauri, getConversation, type ConversationMessage } from "@/lib/tauri";
import { useToast } from "@/context/ToastContext";

export function ActivityTable() {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { showSuccess } = useToast();

  useEffect(() => {
    if (isTauri()) {
      loadMessages();
      // Refresh every 2 seconds to catch new messages
      const interval = setInterval(loadMessages, 2000);
      return () => clearInterval(interval);
    } else {
      setIsLoading(false);
    }
  }, []);

  const loadMessages = async () => {
    try {
      const msgs = await getConversation();
      setMessages(msgs.filter(m => m.role === "User"));
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      showSuccess("Copied to clipboard");
    } catch {
      console.error("Failed to copy");
    }
  };

  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ""; }
  };

  const formatDate = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.toDateString() === today.toDateString()) return "TODAY";
      if (date.toDateString() === yesterday.toDateString()) return "YESTERDAY";
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase();
    } catch { return ""; }
  };

  // Group messages by date
  const groupedMessages = messages.reduce((groups, msg) => {
    const dateKey = formatDate(msg.timestamp);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(msg);
    return groups;
  }, {} as Record<string, ConversationMessage[]>);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <div className="h-6 w-6 mx-auto animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-muted">No activity yet. Start speaking to see your transcriptions here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Object.entries(groupedMessages).map(([dateKey, msgs]) => (
        <div key={dateKey}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            {dateKey}
          </h3>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {msgs.map((msg, idx) => (
              <div
                key={msg.id}
                onClick={() => handleCopy(msg.content)}
                className={`flex gap-6 px-5 py-3 cursor-pointer transition-colors hover:bg-sidebar-hover ${
                  idx !== msgs.length - 1 ? "border-b border-border" : ""
                }`}
                title="Click to copy"
              >
                <span className="w-20 shrink-0 text-sm text-muted">
                  {formatTime(msg.timestamp)}
                </span>
                <p className="text-sm text-foreground">{msg.content}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

