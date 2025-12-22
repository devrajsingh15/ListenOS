"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  isTauri,
  getConversation,
  clearConversation,
  newConversationSession,
  type ConversationMessage,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";

export default function ConversationPage() {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isTauri()) {
      loadConversation();
    } else {
      setIsLoading(false);
    }
  }, []);

  const loadConversation = async () => {
    setIsLoading(true);
    try {
      const msgs = await getConversation();
      setMessages(msgs);
    } catch (error) {
      console.error("Failed to load conversation:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    try {
      await clearConversation();
      setMessages([]);
    } catch (error) {
      console.error("Failed to clear conversation:", error);
    }
  };

  const handleNewSession = async () => {
    try {
      await newConversationSession();
      setMessages([]);
    } catch (error) {
      console.error("Failed to create new session:", error);
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

  const getActionIcon = (actionTaken: string | null, success: boolean | null) => {
    if (!actionTaken) return null;

    const isSuccess = success === true;
    const isFailed = success === false;

    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
          isSuccess && "bg-green-500/20 text-green-400",
          isFailed && "bg-red-500/20 text-red-400",
          !isSuccess && !isFailed && "bg-blue-500/20 text-blue-400"
        )}
      >
        {isSuccess && (
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {isFailed && (
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        {actionTaken}
      </span>
    );
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Conversation History</h1>
            <p className="text-sm text-muted">
              View your conversation with ListenOS including all commands and responses
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleNewSession}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Session
            </button>
            <button
              onClick={handleClear}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-sidebar-hover"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted">Total Messages</p>
            <p className="text-2xl font-bold text-foreground">{messages.length}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted">User Messages</p>
            <p className="text-2xl font-bold text-foreground">
              {messages.filter((m) => m.role === "User").length}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted">AI Responses</p>
            <p className="text-2xl font-bold text-foreground">
              {messages.filter((m) => m.role === "Assistant").length}
            </p>
          </div>
        </div>

        {/* Messages List */}
        <div className="rounded-xl border border-border bg-card">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <div className="mb-4 rounded-full bg-primary/10 p-4">
                <svg className="h-8 w-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="mb-1 font-medium text-foreground">No conversation history</h3>
              <p className="text-sm text-muted">
                Start speaking with ListenOS to see your conversation here
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-4 p-4",
                    msg.role === "User" && "bg-background/50"
                  )}
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium",
                      msg.role === "User" && "bg-primary text-white",
                      msg.role === "Assistant" && "bg-green-500/20 text-green-400",
                      msg.role === "System" && "bg-gray-500/20 text-gray-400"
                    )}
                  >
                    {msg.role === "User" ? "You" : msg.role === "Assistant" ? "AI" : "Sys"}
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {msg.role === "User" ? "You" : msg.role === "Assistant" ? "ListenOS" : "System"}
                      </span>
                      <span className="text-xs text-muted">{formatTime(msg.timestamp)}</span>
                      {getActionIcon(msg.action_taken, msg.action_success)}
                    </div>
                    <p className="mt-1 text-sm text-foreground/80">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
