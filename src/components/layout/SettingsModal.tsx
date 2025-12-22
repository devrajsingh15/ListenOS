"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Settings02Icon,
  ComputerIcon,
  HashtagIcon,
  TestTubeIcon,
  UserCircleIcon,
  UserGroupIcon,
  CreditCardIcon,
  ShieldUserIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsSection =
  | "general"
  | "system"
  | "vibe-coding"
  | "experimental"
  | "account"
  | "team"
  | "billing"
  | "privacy";

interface SettingsNavItem {
  id: SettingsSection;
  label: string;
  icon: typeof Settings02Icon;
  category: "settings" | "account";
}

const settingsNavItems: SettingsNavItem[] = [
  { id: "general", label: "General", icon: Settings02Icon, category: "settings" },
  { id: "system", label: "System", icon: ComputerIcon, category: "settings" },
  { id: "vibe-coding", label: "Vibe coding", icon: HashtagIcon, category: "settings" },
  { id: "experimental", label: "Experimental", icon: TestTubeIcon, category: "settings" },
  { id: "account", label: "Account", icon: UserCircleIcon, category: "account" },
  { id: "team", label: "Team", icon: UserGroupIcon, category: "account" },
  { id: "billing", label: "Plans and Billing", icon: CreditCardIcon, category: "account" },
  { id: "privacy", label: "Data and Privacy", icon: ShieldUserIcon, category: "account" },
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");

  const settingsItems = settingsNavItems.filter((item) => item.category === "settings");
  const accountItems = settingsNavItems.filter((item) => item.category === "account");

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 z-50 flex h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl bg-card shadow-modal"
          >
            {/* Settings Sidebar */}
            <div className="flex w-56 flex-col border-r border-border bg-sidebar-bg p-4">
              {/* Settings Section */}
              <div className="mb-4">
                <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted">
                  Settings
                </h3>
                <ul className="space-y-1">
                  {settingsItems.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => setActiveSection(item.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          activeSection === item.id
                            ? "bg-sidebar-active text-foreground"
                            : "text-muted hover:bg-sidebar-hover hover:text-foreground"
                        )}
                      >
                        <HugeiconsIcon icon={item.icon} size={18} />
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Account Section */}
              <div>
                <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted">
                  Account
                </h3>
                <ul className="space-y-1">
                  {accountItems.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => setActiveSection(item.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          activeSection === item.id
                            ? "bg-sidebar-active text-foreground"
                            : "text-muted hover:bg-sidebar-hover hover:text-foreground"
                        )}
                      >
                        <HugeiconsIcon icon={item.icon} size={18} />
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Version */}
              <div className="mt-auto px-3 pt-4">
                <span className="text-xs text-muted-foreground">ListenOS v1.0.0</span>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-6">
              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute right-4 top-4 rounded-lg p-2 text-muted transition-colors hover:bg-sidebar-hover hover:text-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={20} />
              </button>

              {/* Section Content */}
              <SettingsContent section={activeSection} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function SettingsContent({ section }: { section: SettingsSection }) {
  switch (section) {
    case "general":
      return (
        <div className="animate-fade-in">
          <h2 className="mb-6 text-2xl font-semibold text-foreground">General</h2>
          <div className="space-y-6">
            <SettingsRow
              label="Keyboard shortcuts"
              description="Hold Ctrl + Space and speak."
              action={<button className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-sidebar-hover">Change</button>}
            />
            <SettingsRow
              label="Microphone"
              description="Auto-detect (Default)"
              action={<button className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-sidebar-hover">Change</button>}
            />
            <SettingsRow
              label="Languages"
              description="English"
              action={<button className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-sidebar-hover">Change</button>}
            />
          </div>
        </div>
      );
    case "system":
      return (
        <div className="animate-fade-in">
          <h2 className="mb-6 text-2xl font-semibold text-foreground">System</h2>
          <div className="space-y-6">
            <SettingsRow
              label="Start on login"
              description="Automatically start ListenOS when you log in"
              action={<ToggleSwitch defaultChecked />}
            />
            <SettingsRow
              label="Show in menu bar"
              description="Display ListenOS icon in the system tray"
              action={<ToggleSwitch defaultChecked />}
            />
          </div>
        </div>
      );
    case "vibe-coding":
      return (
        <div className="animate-fade-in">
          <h2 className="mb-6 text-2xl font-semibold text-foreground">Vibe coding</h2>
          <p className="text-muted">Configure voice-to-code settings for development workflows.</p>
        </div>
      );
    case "experimental":
      return (
        <div className="animate-fade-in">
          <h2 className="mb-6 text-2xl font-semibold text-foreground">Experimental</h2>
          <p className="text-muted">Try out new features before they&apos;re released.</p>
        </div>
      );
    case "account":
      return (
        <div className="animate-fade-in">
          <h2 className="mb-6 text-2xl font-semibold text-foreground">Account</h2>
          <div className="space-y-6">
            <SettingsRow
              label="Email"
              description="user@example.com"
              action={<button className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-sidebar-hover">Edit</button>}
            />
            <SettingsRow
              label="Sign out"
              description="Sign out of your account"
              action={<button className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100">Sign out</button>}
            />
          </div>
        </div>
      );
    case "team":
      return (
        <div className="animate-fade-in">
          <h2 className="mb-6 text-2xl font-semibold text-foreground">Team</h2>
          <p className="text-muted">Manage your team members and shared settings.</p>
        </div>
      );
    case "billing":
      return (
        <div className="animate-fade-in">
          <h2 className="mb-6 text-2xl font-semibold text-foreground">Plans and Billing</h2>
          <p className="text-muted">Manage your subscription and payment methods.</p>
        </div>
      );
    case "privacy":
      return (
        <div className="animate-fade-in">
          <h2 className="mb-6 text-2xl font-semibold text-foreground">Data and Privacy</h2>
          <p className="text-muted">Control how your data is stored and processed.</p>
        </div>
      );
    default:
      return null;
  }
}

function SettingsRow({
  label,
  description,
  action,
}: {
  label: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">{label}</h3>
        <p className="text-sm text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

function ToggleSwitch({ defaultChecked = false }: { defaultChecked?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);

  return (
    <button
      onClick={() => setChecked(!checked)}
      className={cn(
        "relative h-6 w-11 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-border"
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked && "translate-x-5"
        )}
      />
    </button>
  );
}

