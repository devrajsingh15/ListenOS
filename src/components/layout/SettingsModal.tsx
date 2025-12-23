"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { isTauri, getAutostartEnabled, setAutostartEnabled } from "@/lib/tauri";
import { checkForUpdates } from "@/lib/updater";
import { useAuth } from "@/context/AuthContext";
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
  Download04Icon,
  Loading03Icon,
  CheckmarkCircle02Icon,
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

const APP_VERSION = "0.1.0";

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
                <span className="text-xs text-muted-foreground">ListenOS v{APP_VERSION}</span>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
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
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const { user, subscription, settings, signIn, signOut, updateSettings, isAuthenticated } = useAuth();

  // Local state for system settings
  const [startOnLogin, setStartOnLogin] = useState(settings?.startOnLogin ?? false);
  const [showInTray, setShowInTray] = useState(settings?.showInTray ?? true);
  const [language, setLanguage] = useState(settings?.language ?? "en");
  const [autostartLoading, setAutostartLoading] = useState(false);

  // Load actual autostart state on mount
  useEffect(() => {
    if (isTauri()) {
      getAutostartEnabled()
        .then((enabled) => setStartOnLogin(enabled))
        .catch((err) => console.error("Failed to get autostart status:", err));
    }
  }, []);

  // Update local state when settings change
  useEffect(() => {
    if (settings) {
      setShowInTray(settings.showInTray);
      setLanguage(settings.language);
    }
  }, [settings]);

  const handleCheckUpdates = useCallback(async () => {
    if (!isTauri()) {
      setUpdateStatus("Updates only available in desktop app");
      return;
    }
    
    setIsCheckingUpdates(true);
    setUpdateStatus(null);
    
    try {
      await checkForUpdates(false);
      setUpdateStatus("You're on the latest version!");
    } catch (error) {
      console.error("Update check failed:", error);
      setUpdateStatus("Failed to check for updates");
    } finally {
      setIsCheckingUpdates(false);
    }
  }, []);

  const handleStartOnLoginChange = useCallback(async (checked: boolean) => {
    if (!isTauri()) {
      setStartOnLogin(checked);
      await updateSettings({ startOnLogin: checked });
      return;
    }
    
    setAutostartLoading(true);
    try {
      const newState = await setAutostartEnabled(checked);
      setStartOnLogin(newState);
      await updateSettings({ startOnLogin: newState });
    } catch (err) {
      console.error("Failed to set autostart:", err);
      // Revert UI state on error
      setStartOnLogin(!checked);
    } finally {
      setAutostartLoading(false);
    }
  }, [updateSettings]);

  const handleShowInTrayChange = useCallback(async (checked: boolean) => {
    setShowInTray(checked);
    await updateSettings({ showInTray: checked });
  }, [updateSettings]);

  const handleLanguageChange = useCallback(async (newLanguage: string) => {
    setLanguage(newLanguage);
    await updateSettings({ language: newLanguage });
  }, [updateSettings]);

  switch (section) {
    case "general":
      return (
        <div className="animate-fade-in">
          <h2 className="mb-6 text-2xl font-semibold text-foreground">General</h2>
          <div className="space-y-6">
            <SettingsRow
              label="Keyboard shortcuts"
              description={settings?.hotkey || "Hold Ctrl + Space and speak."}
              action={
                <button className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-sidebar-hover">
                  Change
                </button>
              }
            />
            <SettingsRow
              label="Microphone"
              description="Auto-detect (Default)"
              action={
                <button className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-sidebar-hover">
                  Change
                </button>
              }
            />
            <SettingsRow
              label="Languages"
              description={language === "en" ? "English" : language}
              action={
                <select
                  value={language}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-sidebar-hover"
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="zh">Chinese</option>
                  <option value="ja">Japanese</option>
                </select>
              }
            />
            <SettingsRow
              label="Check for updates"
              description={updateStatus || "Check if a new version is available"}
              action={
                <button 
                  onClick={handleCheckUpdates}
                  disabled={isCheckingUpdates}
                  className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-sidebar-hover disabled:opacity-50"
                >
                  <HugeiconsIcon 
                    icon={isCheckingUpdates ? Loading03Icon : Download04Icon} 
                    size={16} 
                    className={isCheckingUpdates ? "animate-spin" : ""}
                  />
                  {isCheckingUpdates ? "Checking..." : "Check now"}
                </button>
              }
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
              action={
                <ToggleSwitch 
                  checked={startOnLogin} 
                  onChange={handleStartOnLoginChange}
                  disabled={autostartLoading}
                />
              }
            />
            <SettingsRow
              label="Show in menu bar"
              description="Display ListenOS icon in the system tray"
              action={
                <ToggleSwitch 
                  checked={showInTray} 
                  onChange={handleShowInTrayChange}
                />
              }
            />
          </div>
        </div>
      );
    case "vibe-coding":
      return (
        <div className="animate-fade-in">
          <h2 className="mb-6 text-2xl font-semibold text-foreground">Vibe coding</h2>
          <p className="text-muted mb-4">Configure voice-to-code settings for development workflows.</p>
          <div className="rounded-lg border border-border bg-sidebar-bg p-4">
            <p className="text-sm text-muted">Coming soon! Voice-to-code features are being developed.</p>
          </div>
        </div>
      );
    case "experimental":
      return (
        <div className="animate-fade-in">
          <h2 className="mb-6 text-2xl font-semibold text-foreground">Experimental</h2>
          <p className="text-muted mb-4">Try out new features before they&apos;re released.</p>
          <div className="rounded-lg border border-border bg-sidebar-bg p-4">
            <p className="text-sm text-muted">No experimental features available at this time.</p>
          </div>
        </div>
      );
    case "account":
      return (
        <div className="animate-fade-in">
          <h2 className="mb-6 text-2xl font-semibold text-foreground">Account</h2>
          {isAuthenticated && user ? (
            <div className="space-y-6">
              <SettingsRow
                label="Email"
                description={user.email}
                action={<span className="text-sm text-muted">Managed by Clerk</span>}
              />
              {user.firstName && (
                <SettingsRow
                  label="Name"
                  description={`${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`}
                  action={<span className="text-sm text-muted">Managed by Clerk</span>}
                />
              )}
              <SettingsRow
                label="Sign out"
                description="Sign out of your account"
                action={
                  <button 
                    onClick={signOut}
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
                  >
                    Sign out
                  </button>
                }
              />
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-muted">Sign in to sync your settings and unlock premium features.</p>
              <button
                onClick={signIn}
                className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
              >
                Sign in
              </button>
            </div>
          )}
        </div>
      );
    case "team":
      return (
        <div className="animate-fade-in">
          <h2 className="mb-6 text-2xl font-semibold text-foreground">Team</h2>
          {isAuthenticated ? (
            <div className="rounded-lg border border-border bg-sidebar-bg p-4">
              <p className="text-sm text-muted">Team features are available on the Team plan. Upgrade to invite team members.</p>
            </div>
          ) : (
            <p className="text-muted">Sign in to manage your team.</p>
          )}
        </div>
      );
    case "billing":
      return (
        <div className="animate-fade-in">
          <h2 className="mb-6 text-2xl font-semibold text-foreground">Plans and Billing</h2>
          {isAuthenticated ? (
            <div className="space-y-6">
              {/* Current Plan */}
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold text-foreground">
                    {subscription?.plan === "pro" ? "Pro Plan" : subscription?.plan === "team" ? "Team Plan" : "Free Plan"}
                  </h3>
                  <span className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    subscription?.status === "active" 
                      ? "bg-green-100 text-green-700" 
                      : "bg-yellow-100 text-yellow-700"
                  )}>
                    {subscription?.status || "Active"}
                  </span>
                </div>
                <p className="text-sm text-muted">
                  {subscription?.plan === "free" 
                    ? "50 voice commands per day with basic features"
                    : subscription?.plan === "pro"
                    ? "Unlimited voice commands with advanced AI features"
                    : "Team collaboration with shared custom commands"
                  }
                </p>
              </div>

              {/* Available Plans */}
              <div className="grid gap-4">
                <PlanCard
                  name="Free"
                  price={0}
                  features={[
                    "50 voice commands/day",
                    "Basic transcription",
                    "Standard actions",
                  ]}
                  isCurrent={subscription?.plan === "free"}
                />
                <PlanCard
                  name="Pro"
                  price={9.99}
                  features={[
                    "Unlimited voice commands",
                    "Advanced AI responses",
                    "Priority processing",
                    "Custom commands",
                    "Email support",
                  ]}
                  isCurrent={subscription?.plan === "pro"}
                />
                <PlanCard
                  name="Team"
                  price={29.99}
                  features={[
                    "Everything in Pro",
                    "Team management",
                    "Shared custom commands",
                    "Analytics dashboard",
                    "Priority support",
                  ]}
                  isCurrent={subscription?.plan === "team"}
                />
              </div>
            </div>
          ) : (
            <p className="text-muted">Sign in to manage your subscription.</p>
          )}
        </div>
      );
    case "privacy":
      return (
        <div className="animate-fade-in">
          <h2 className="mb-6 text-2xl font-semibold text-foreground">Data and Privacy</h2>
          <div className="space-y-6">
            <SettingsRow
              label="Voice data"
              description="Voice recordings are processed locally and not stored"
              action={<span className="text-sm text-green-600">Secure</span>}
            />
            <SettingsRow
              label="Command history"
              description="Clear your command history from this device"
              action={
                <button className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100">
                  Clear history
                </button>
              }
            />
            <SettingsRow
              label="Delete account"
              description="Permanently delete your account and all data"
              action={
                <button className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100">
                  Delete account
                </button>
              }
            />
          </div>
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

function ToggleSwitch({ 
  checked, 
  onChange,
  disabled = false,
}: { 
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        "relative h-6 w-11 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-border",
        disabled && "opacity-50 cursor-not-allowed"
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

function PlanCard({
  name,
  price,
  features,
  isCurrent,
}: {
  name: string;
  price: number;
  features: string[];
  isCurrent: boolean;
}) {
  return (
    <div className={cn(
      "rounded-lg border p-4",
      isCurrent ? "border-primary bg-primary/5" : "border-border"
    )}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-foreground">{name}</h3>
          <p className="text-lg font-bold text-foreground">
            {price === 0 ? "Free" : `$${price}/mo`}
          </p>
        </div>
        {isCurrent ? (
          <span className="flex items-center gap-1 text-sm text-primary">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} />
            Current
          </span>
        ) : (
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover">
            Upgrade
          </button>
        )}
      </div>
      <ul className="space-y-1">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-muted">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} className="text-green-500" />
            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}
