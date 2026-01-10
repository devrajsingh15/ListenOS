"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

// API configuration - use production URL in builds, localhost for dev
const API_URL = process.env.NEXT_PUBLIC_API_URL || 
  (process.env.NODE_ENV === "production" 
    ? "https://server-c6vdxgsxi-devrajsingh15s-projects.vercel.app"
    : "http://localhost:3001");

// Storage keys
const STORAGE_KEY_USER = "listenos_user";
const STORAGE_KEY_TOKEN = "listenos_token";
const STORAGE_KEY_OFFLINE = "listenos_offline_mode";

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
  isOfflineMode: boolean;
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
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  // Load stored auth data on mount
  useEffect(() => {
    const loadStoredAuth = () => {
      try {
        // Check for offline mode
        const offlineMode = localStorage.getItem(STORAGE_KEY_OFFLINE);
        if (offlineMode === "true") {
          setIsOfflineMode(true);
        }

        const storedUser = localStorage.getItem(STORAGE_KEY_USER);
        const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
        
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
        if (storedToken) {
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

  const handleAuthCallback = useCallback((newToken: string, userData: User) => {
    setToken(newToken);
    setUser(userData);
    setIsOfflineMode(false);
    localStorage.setItem(STORAGE_KEY_TOKEN, newToken);
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userData));
    localStorage.removeItem(STORAGE_KEY_OFFLINE);
  }, []);

  // Listen for deep link auth callback
  useEffect(() => {
    const handleDeepLink = async () => {
      try {
        // Listen for deep-link events from Tauri (single instance callback)
        const { listen } = await import("@tauri-apps/api/event");
        
        const unlisten = await listen<string>("deep-link", (event) => {
          const url = event.payload;
          console.log("Deep link received:", url);
          
          if (url.includes("auth/callback")) {
            try {
              const urlObj = new URL(url);
              const callbackToken = urlObj.searchParams.get("token");
              const userData = urlObj.searchParams.get("user");
              
              if (callbackToken && userData) {
                const parsedUser = JSON.parse(decodeURIComponent(userData));
                handleAuthCallback(callbackToken, parsedUser);
              }
            } catch (e) {
              console.error("Failed to parse auth callback:", e);
            }
          }
        });

        // Also try to get initial deep link URL on startup
        const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
        
        onOpenUrl((urls) => {
          for (const url of urls) {
            console.log("Deep link URL opened:", url);
            if (url.includes("auth/callback")) {
              try {
                const urlObj = new URL(url);
                const callbackToken = urlObj.searchParams.get("token");
                const userData = urlObj.searchParams.get("user");
                
                if (callbackToken && userData) {
                  const parsedUser = JSON.parse(decodeURIComponent(userData));
                  handleAuthCallback(callbackToken, parsedUser);
                }
              } catch (e) {
                console.error("Failed to parse auth callback:", e);
              }
            }
          }
        });

        return () => {
          unlisten();
        };
      } catch (error) {
        // Not in Tauri environment
        console.log("Deep link not available:", error);
      }
    };

    handleDeepLink();
  }, [handleAuthCallback]);

  const refreshUser = useCallback(async () => {
    if (!token || isOfflineMode) return;

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
  }, [token, isOfflineMode]);

  const signIn = useCallback(() => {
    // Open the auth URL in the default browser
    const authUrl = `${API_URL}/sign-in?redirect_url=listenos://auth/callback`;
    
    if (typeof window !== "undefined") {
      // Use Tauri shell to open URL if available
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
    setIsOfflineMode(false);
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_OFFLINE);
  }, []);

  const updateSettings = useCallback(async (newSettings: Partial<UserSettings>) => {
    if (isOfflineMode) {
      // In offline mode, just update local state
      setSettings(prev => prev ? { ...prev, ...newSettings } : null);
      return;
    }

    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newSettings),
      });

      if (response.ok) {
        setSettings(prev => prev ? { ...prev, ...newSettings } : null);
      }
    } catch (error) {
      console.error("Failed to update settings:", error);
    }
  }, [token, isOfflineMode]);

  return (
    <AuthContext.Provider
      value={{
        user,
        subscription,
        settings,
        isLoading,
        isAuthenticated: !!user,
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
