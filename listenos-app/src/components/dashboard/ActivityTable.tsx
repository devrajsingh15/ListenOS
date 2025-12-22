"use client";

import { formatTime, formatDate } from "@/lib/utils";

interface ActivityEntry {
  id: string;
  timestamp: Date;
  content: string;
}

interface ActivityTableProps {
  entries: ActivityEntry[];
}

export function ActivityTable({ entries }: ActivityTableProps) {
  // Group entries by date
  const groupedEntries = entries.reduce(
    (acc, entry) => {
      const dateKey = formatDate(entry.timestamp);
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(entry);
      return acc;
    },
    {} as Record<string, ActivityEntry[]>
  );

  const dateGroups = Object.entries(groupedEntries);

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-muted">No activity yet. Start speaking to see your transcriptions here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {dateGroups.map(([date, dateEntries], groupIndex) => (
        <div key={date}>
          {/* Date Header */}
          <div className="border-b border-border bg-sidebar-bg px-6 py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              {date}
            </span>
          </div>

          {/* Entries */}
          {dateEntries.map((entry, entryIndex) => (
            <div
              key={entry.id}
              className={`flex items-start gap-6 px-6 py-4 transition-colors hover:bg-sidebar-hover ${
                entryIndex !== dateEntries.length - 1 || groupIndex !== dateGroups.length - 1
                  ? "border-b border-border"
                  : ""
              }`}
            >
              <span className="w-20 shrink-0 text-sm text-muted">
                {formatTime(entry.timestamp)}
              </span>
              <p className="flex-1 text-sm text-foreground">{entry.content}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

