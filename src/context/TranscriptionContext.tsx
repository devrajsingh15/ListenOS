"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export interface ActivityEntry {
  id: string;
  timestamp: Date;
  content: string;
}

interface TranscriptionContextType {
  activities: ActivityEntry[];
  addActivity: (content: string) => void;
  clearActivities: () => void;
  totalWords: number;
}

const TranscriptionContext = createContext<TranscriptionContextType | undefined>(undefined);

export function TranscriptionProvider({ children }: { children: ReactNode }) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);

  const addActivity = useCallback((content: string) => {
    const newEntry: ActivityEntry = {
      id: Date.now().toString(),
      timestamp: new Date(),
      content,
    };
    setActivities((prev) => [newEntry, ...prev]);
  }, []);

  const clearActivities = useCallback(() => {
    setActivities([]);
  }, []);

  const totalWords = activities.reduce((count, entry) => {
    return count + entry.content.split(/\s+/).filter(Boolean).length;
  }, 0);

  return (
    <TranscriptionContext.Provider
      value={{ activities, addActivity, clearActivities, totalWords }}
    >
      {children}
    </TranscriptionContext.Provider>
  );
}

export function useTranscription() {
  const context = useContext(TranscriptionContext);
  if (!context) {
    throw new Error("useTranscription must be used within a TranscriptionProvider");
  }
  return context;
}

