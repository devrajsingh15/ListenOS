"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "./Sidebar";
import { SettingsModal } from "./SettingsModal";
import { TranscriptionProvider } from "@/context/TranscriptionContext";
import { motion, AnimatePresence } from "framer-motion";

interface AppShellProps {
  children: React.ReactNode;
}

interface Toast {
  id: string;
  message: string;
  type: "info" | "command" | "error";
}

function AppShellContent({ children }: AppShellProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <>
      <Sidebar onSettingsClick={() => setIsSettingsOpen(true)} />
      
      {/* Main Content Area */}
      <main className="ml-56 min-h-screen bg-background p-8">
        <div className="mx-auto max-w-4xl">
          {children}
        </div>
      </main>

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className={`rounded-lg px-4 py-3 shadow-lg ${
                toast.type === "command"
                  ? "bg-primary text-white"
                  : toast.type === "error"
                  ? "bg-red-500 text-white"
                  : "bg-card text-foreground border border-border"
              }`}
            >
              <p className="text-sm font-medium">{toast.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}

export function AppShell({ children }: AppShellProps) {
  return (
    <TranscriptionProvider>
      <AppShellContent>{children}</AppShellContent>
    </TranscriptionProvider>
  );
}
