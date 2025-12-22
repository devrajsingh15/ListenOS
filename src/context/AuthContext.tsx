"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

// WorkOS configuration
const WORKOS_CLIENT_ID = process.env.NEXT_PUBLIC_WORKOS_CLIENT_ID || "";
const WORKOS_REDIRECT_URI = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI || "http://localhost:3000/auth/callback";

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profilePictureUrl?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = "listenos_auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from localStorage on mount
  useEffect(() => {
    const loadUser = () => {
      try {
        const stored = localStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.user && parsed.expiresAt > Date.now()) {
            setUser(parsed.user);
          } else {
            localStorage.removeItem(AUTH_STORAGE_KEY);
          }
        }
      } catch (error) {
        console.error("Failed to load auth state:", error);
        localStorage.removeItem(AUTH_STORAGE_KEY);
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();

    // Listen for auth callback messages (from popup or redirect)
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "WORKOS_AUTH_SUCCESS" && event.data?.user) {
        const userData = event.data.user;
        setUser(userData);
        // Store with 7 day expiry
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
          user: userData,
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        }));
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Check URL for auth callback (after redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    
    if (code) {
      // Exchange code for user info
      handleAuthCallback(code);
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleAuthCallback = async (code: string) => {
    try {
      setIsLoading(true);
      // In a real app, you'd exchange this code on your backend
      // For now, we'll simulate a successful auth
      // The code would be sent to your backend which calls WorkOS API
      console.log("Auth code received:", code);
      
      // Simulate user data (in production, this comes from your backend after code exchange)
      const mockUser: User = {
        id: "user_" + Date.now(),
        email: "user@example.com",
        firstName: "ListenOS",
        lastName: "User",
      };
      
      setUser(mockUser);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
        user: mockUser,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      }));
    } catch (error) {
      console.error("Auth callback failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = useCallback(() => {
    // Generate state for CSRF protection
    const state = Math.random().toString(36).substring(7);
    sessionStorage.setItem("workos_state", state);

    // Build WorkOS authorization URL
    const authUrl = new URL("https://api.workos.com/user_management/authorize");
    authUrl.searchParams.set("client_id", WORKOS_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", WORKOS_REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("provider", "authkit");

    // Open in default browser (for Tauri desktop app)
    if (typeof window !== "undefined") {
      window.open(authUrl.toString(), "_blank");
    }
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signOut,
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
