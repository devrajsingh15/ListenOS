"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { isTauri } from "@/lib/tauri";

// API configuration
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const WORKOS_CLIENT_ID = process.env.NEXT_PUBLIC_WORKOS_CLIENT_ID || "";

// Token storage keys
const AUTH_TOKEN_KEY = "listenos_auth_token";
const AUTH_USER_KEY = "listenos_auth_user";

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
}

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

interface AuthContextType {
  user: User | null;
  subscription: Subscription | null;
  settings: UserSettings | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  token: string | null;
  signIn: () => void;
  signOut: () => void;
  refreshUser: () => Promise<void>;
  updateSettings: (settings: Partial<UserSettings>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface SessionData {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  exp: number;
}

function parseToken(token: string): SessionData | null {
  try {
    const decoded = atob(token);
    const data = JSON.parse(decoded) as SessionData;
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load auth state from localStorage on mount
  useEffect(() => {
    const loadAuth = () => {
      try {
        const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
        const storedUser = localStorage.getItem(AUTH_USER_KEY);

        if (storedToken) {
          const session = parseToken(storedToken);
          if (session) {
            setToken(storedToken);
            if (storedUser) {
              setUser(JSON.parse(storedUser));
            } else {
              // Extract user from token
              setUser({
                id: session.userId,
                email: session.email,
                firstName: session.firstName,
                lastName: session.lastName,
                profilePicture: session.profilePicture,
              });
            }
          } else {
            // Token expired
            localStorage.removeItem(AUTH_TOKEN_KEY);
            localStorage.removeItem(AUTH_USER_KEY);
          }
        }
      } catch (error) {
        console.error("Failed to load auth state:", error);
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_USER_KEY);
      } finally {
        setIsLoading(false);
      }
    };

    loadAuth();
  }, []);

  // Listen for deep link auth callback (Tauri)
  useEffect(() => {
    if (!isTauri()) return;

    const setupDeepLinkListener = async () => {
      try {
        // Import Tauri's deep link listener
        const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
        
        const unlisten = await onOpenUrl((urls) => {
          for (const url of urls) {
            if (url.startsWith("listenos://auth-callback")) {
              const urlObj = new URL(url);
              const authToken = urlObj.searchParams.get("token");
              
              if (authToken) {
                handleAuthToken(authToken);
              }
            }
          }
        });

        return () => {
          unlisten();
        };
      } catch (error) {
        console.error("Failed to setup deep link listener:", error);
      }
    };

    setupDeepLinkListener();
  }, []);

  // Handle URL-based auth callback (web fallback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authToken = params.get("token");

    if (authToken) {
      handleAuthToken(authToken);
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleAuthToken = useCallback((authToken: string) => {
    const session = parseToken(authToken);
    if (!session) {
      console.error("Invalid auth token");
      return;
    }

    const userData: User = {
      id: session.userId,
      email: session.email,
      firstName: session.firstName,
      lastName: session.lastName,
      profilePicture: session.profilePicture,
    };

    setToken(authToken);
    setUser(userData);
    localStorage.setItem(AUTH_TOKEN_KEY, authToken);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userData));

    // Fetch full user data including subscription and settings
    fetchUserData(authToken);
  }, []);

  const fetchUserData = async (authToken: string) => {
    if (!API_URL) return;

    try {
      const response = await fetch(`${API_URL}/api/auth/session`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.user) setUser(data.user);
        if (data.subscription) setSubscription(data.subscription);
        if (data.settings) setSettings(data.settings);
      }
    } catch (error) {
      console.error("Failed to fetch user data:", error);
    }
  };

  const refreshUser = useCallback(async () => {
    if (!token || !API_URL) return;
    await fetchUserData(token);
  }, [token]);

  const signIn = useCallback(() => {
    // Generate state for CSRF protection
    const state = Math.random().toString(36).substring(7);
    sessionStorage.setItem("workos_state", state);

    // Redirect URI points to our API which handles the code exchange
    // and redirects back to the app with a token
    const redirectUri = `${API_URL}/api/auth/callback`;

    // Build WorkOS authorization URL
    const authUrl = new URL("https://api.workos.com/user_management/authorize");
    authUrl.searchParams.set("client_id", WORKOS_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("provider", "authkit");

    // Open in default browser
    if (isTauri()) {
      // Use Tauri's shell plugin to open in default browser
      import("@tauri-apps/plugin-shell").then(({ open }) => {
        open(authUrl.toString());
      });
    } else {
      window.location.href = authUrl.toString();
    }
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    setSubscription(null);
    setSettings(null);
    setToken(null);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
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
        token,
        signIn,
        signOut,
        refreshUser,
        updateSettings,
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
