"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

const STORAGE_KEY_SETTINGS = "listenos_local_settings";

interface Subscription {
  id: string;
  plan: string;
  status: string;
  expiresAt?: string;
}

interface UserSettings {
  hotkey: string;
  language: string;
  startOnLogin: boolean;
  showInTray: boolean;
}

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
}

const DEFAULT_USER: User = {
  id: "local-selfhosted",
  email: "selfhosted@local",
  firstName: "Self-hosted",
  lastName: "User",
};

const DEFAULT_SETTINGS: UserSettings = {
  hotkey: "Ctrl+Space",
  language: "en",
  startOnLogin: true,
  showInTray: true,
};

const DEFAULT_SUBSCRIPTION: Subscription = {
  id: "selfhosted",
  plan: "self-hosted",
  status: "active",
};

interface AuthContextType {
  user: User | null;
  subscription: Subscription | null;
  settings: UserSettings | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isOfflineMode: boolean;
  signIn: () => void;
  signOut: () => void;
  refreshUser: () => Promise<void>;
  updateSettings: (settings: Partial<UserSettings>) => Promise<void>;
  handleAuthCallback: (token: string, userData: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user] = useState<User | null>(DEFAULT_USER);
  const [subscription] = useState<Subscription | null>(DEFAULT_SUBSCRIPTION);
  const [settings, setSettings] = useState<UserSettings | null>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isOfflineMode] = useState(true);

  useEffect(() => {
    const loadStoredSettings = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
        if (!saved) {
          return;
        }
        const parsed = JSON.parse(saved) as Partial<UserSettings>;
        setSettings((prev) => ({
          ...(prev ?? DEFAULT_SETTINGS),
          ...parsed,
        }));
      } catch (error) {
        console.error("Failed to load local settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStoredSettings();
  }, []);

  const handleAuthCallback = useCallback((_newToken: string, _userData: User) => {
    // Login is intentionally disabled in self-hosted mode.
  }, []);

  const refreshUser = useCallback(async () => {
    // No-op in self-hosted mode.
  }, []);

  const signIn = useCallback(() => {
    // No-op in self-hosted mode.
  }, []);

  const signOut = useCallback(() => {
    // No-op in self-hosted mode.
  }, []);

  const updateSettings = useCallback(async (newSettings: Partial<UserSettings>) => {
    setSettings((prev) => {
      const merged = {
        ...(prev ?? DEFAULT_SETTINGS),
        ...newSettings,
      };

      try {
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(merged));
      } catch (error) {
        console.error("Failed to persist local settings:", error);
      }

      return merged;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        subscription,
        settings,
        isLoading,
        isAuthenticated: true,
        isOfflineMode,
        signIn,
        signOut,
        refreshUser,
        updateSettings,
        handleAuthCallback,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function SignedIn({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading || !isAuthenticated) return null;
  return <>{children}</>;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading || isAuthenticated) return null;
  return <>{children}</>;
}
