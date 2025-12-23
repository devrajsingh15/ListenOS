"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  isTauri,
  getNotes,
  createNote,
  updateNote,
  deleteNote,
  toggleNotePin,
  type Note,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { Mic01Icon, Search01Icon, Delete02Icon, Bookmark01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  useEffect(() => {
    if (isTauri()) {
      loadNotes();
    } else {
      setIsLoading(false);
    }
  }, []);

  const loadNotes = async () => {
    setIsLoading(true);
    try {
      const data = await getNotes(50);
      setNotes(data);
    } catch (error) {
      console.error("Failed to load notes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNote = async () => {
    if (!newNoteContent.trim()) return;
    
    try {
      const note = await createNote(newNoteContent.trim());
      setNotes([note, ...notes]);
      setNewNoteContent("");
    } catch (error) {
      console.error("Failed to create note:", error);
    }
  };

  const handleUpdateNote = async (id: string) => {
    if (!editContent.trim()) return;
    
    try {
      await updateNote(id, editContent.trim());
      setNotes(notes.map(n => n.id === id ? { ...n, content: editContent.trim() } : n));
      setEditingNote(null);
      setEditContent("");
    } catch (error) {
      console.error("Failed to update note:", error);
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await deleteNote(id);
      setNotes(notes.filter(n => n.id !== id));
    } catch (error) {
      console.error("Failed to delete note:", error);
    }
  };

  const handleTogglePin = async (id: string) => {
    try {
      const newPinState = await toggleNotePin(id);
      setNotes(notes.map(n => n.id === id ? { ...n, is_pinned: newPinState } : n)
        .sort((a, b) => {
          if (a.is_pinned && !b.is_pinned) return -1;
          if (!a.is_pinned && b.is_pinned) return 1;
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        }));
    } catch (error) {
      console.error("Failed to toggle pin:", error);
    }
  };

  const formatDate = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString(undefined, { 
        month: "short", 
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "";
    }
  };

  const filteredNotes = searchQuery 
    ? notes.filter(n => n.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : notes;

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
              placeholder="Take a quick note..."
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateNote()}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
            />
            <button 
              onClick={handleCreateNote}
              disabled={!newNoteContent.trim()}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                newNoteContent.trim() 
                  ? "bg-foreground text-white hover:bg-foreground/90"
                  : "bg-muted/20 text-muted cursor-not-allowed"
              )}
            >
              <HugeiconsIcon icon={Mic01Icon} size={20} />
            </button>
          </div>
        </div>

        {/* Search & Notes Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Recents ({filteredNotes.length})
          </span>
          <div className="flex items-center gap-2">
            <div className="relative">
              <HugeiconsIcon 
                icon={Search01Icon} 
                size={16} 
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" 
              />
              <input
                type="text"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 rounded-lg border border-border bg-card py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Notes List */}
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted">
              {searchQuery ? "No notes match your search" : "No notes yet. Create your first note above!"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                className={cn(
                  "group relative rounded-xl border bg-card p-4 transition-colors hover:bg-sidebar-hover",
                  note.is_pinned ? "border-primary/50" : "border-border"
                )}
              >
                {editingNote === note.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full resize-none rounded-lg border border-border bg-background p-2 text-sm text-foreground focus:border-primary focus:outline-none"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingNote(null)}
                        className="rounded-lg px-3 py-1 text-sm text-muted hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleUpdateNote(note.id)}
                        className="rounded-lg bg-primary px-3 py-1 text-sm text-white hover:bg-primary/90"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p 
                      className="cursor-pointer text-sm text-foreground"
                      onClick={() => {
                        setEditingNote(note.id);
                        setEditContent(note.content);
                      }}
                    >
                      {note.content}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-xs text-muted">
                        {formatDate(note.timestamp)}
                      </p>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => handleTogglePin(note.id)}
                          className={cn(
                            "rounded-lg p-1.5 transition-colors hover:bg-sidebar-hover",
                            note.is_pinned ? "text-primary" : "text-muted hover:text-foreground"
                          )}
                          title={note.is_pinned ? "Unpin" : "Pin"}
                        >
                          <HugeiconsIcon icon={Bookmark01Icon} size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
                          title="Delete"
                        >
                          <HugeiconsIcon icon={Delete02Icon} size={14} />
                        </button>
                      </div>
                    </div>
                    {note.is_pinned && (
                      <div className="absolute right-3 top-3">
                        <HugeiconsIcon icon={Bookmark01Icon} size={12} className="text-primary" />
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
