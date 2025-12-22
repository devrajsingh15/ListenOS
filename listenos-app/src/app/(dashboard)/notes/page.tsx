"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Mic01Icon, Search01Icon, FilterIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

interface Note {
  id: string;
  content: string;
  timestamp: Date;
}

export default function NotesPage() {
  const [notes] = useState<Note[]>([]);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-xl font-semibold text-primary">
            For quick thoughts you want to come back to
          </h1>
        </div>

        {/* Voice Input */}
        <div className="mx-auto max-w-xl">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <input
              type="text"
              placeholder="Take a quick note with your voice"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
              readOnly
            />
            <button className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-white transition-colors hover:bg-foreground/90">
              <HugeiconsIcon icon={Mic01Icon} size={20} />
            </button>
          </div>
        </div>

        {/* Notes Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Recents
          </span>
          <div className="flex items-center gap-2">
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

        {/* Notes List */}
        {notes.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted">No notes found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div
                key={note.id}
                className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-sidebar-hover"
              >
                <p className="text-sm text-foreground">{note.content}</p>
                <p className="mt-2 text-xs text-muted">
                  {note.timestamp.toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

