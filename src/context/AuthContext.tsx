"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

// API configuration - for syncing with backend database
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// Storage keys
const STORAGE_KEY_USER = "listenos_user";
const STORAGE_KEY_TOKEN = "listenos_token";

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

interface AuthContextType {
  user: User | null;
  subscription: Subscription | null;
  settings: UserSettings | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: () => void;
  signOut: () => void;
  refreshUser: () => Promise<void>;
  updateSettings: (settings: Partial<UserSettings>) => Promise<void>;
  handleAuthCallback: (token: string, userData: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load stored auth data on mount
  useEffect(() => {
    const loadStoredAuth = () => {
      try {
        const storedUser = localStorage.getItem(STORAGE_KEY_USER);
        const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
        
        if (storedUser && storedToken) {
          setUser(JSON.parse(storedUser));
          setToken(storedToken);
        }
      } catch (error) {
        console.error("Failed to load stored auth:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStoredAuth();
  }, []);

  // Fetch user data from backend when token is available
  useEffect(() => {
    if (!token || !API_URL) return;

    const fetchUserData = async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/session`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.subscription) setSubscription(data.subscription);
          if (data.settings) setSettings(data.settings);
        }
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      }
    };

    fetchUserData();
  }, [token]);

  const handleAuthCallback = useCallback((newToken: string, userData: User) => {
    setToken(newToken);
    setUser(userData);
    localStorage.setItem(STORAGE_KEY_TOKEN, newToken);
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userData));
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token || !API_URL) return;

    try {
      const response = await fetch(`${API_URL}/api/auth/session`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          setUser(data.user);
          localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(data.user));
        }
        if (data.subscription) setSubscription(data.subscription);
        if (data.settings) setSettings(data.settings);
      }
    } catch (error) {
      console.error("Failed to refresh user data:", error);
    }
  }, [token]);

  const signIn = useCallback(() => {
    // Open the auth URL in the default browser
    // The deep-link will redirect back to the app after authentication
    const authUrl = API_URL ? `${API_URL}/sign-in?redirect=listenos://auth/callback` : "";
    if (authUrl && typeof window !== "undefined") {
      // Use Tauri shell to open URL if available, otherwise fallback to window.open
      import("@tauri-apps/plugin-shell").then(({ open }) => {
        open(authUrl);
      }).catch(() => {
        window.open(authUrl, "_blank");
      });
    }
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    setToken(null);
    setSubscription(null);
    setSettings(null);
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_TOKEN);
  }, []);

  const updateSettings = useCallback(async (newSettings: Partial<UserSettings>) => {
    if (!token || !API_URL) return;

    try {
      const response = await fetch(`${API_URL}/api/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newSettings),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.settings) {
          setSettings(data.settings);
        }
      }
    } catch (error) {
      console.error("Failed to update settings:", error);
    }
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        subscription,
        settings,
        isLoading,
        isAuthenticated: !!user,
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

// Helper components for conditional rendering
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
