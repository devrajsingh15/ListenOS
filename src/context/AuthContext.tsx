"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useUser, useClerk, useAuth as useClerkAuth } from "@clerk/nextjs";

// API configuration - for syncing with backend database
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

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
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    profilePicture?: string;
  } | null;
  subscription: Subscription | null;
  settings: UserSettings | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: () => void;
  signOut: () => void;
  refreshUser: () => Promise<void>;
  updateSettings: (settings: Partial<UserSettings>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user: clerkUser, isLoaded: isClerkLoaded } = useUser();
  const { signOut: clerkSignOut, openSignIn } = useClerk();
  const { getToken, userId } = useClerkAuth();
  
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [dbUserId, setDbUserId] = useState<string | null>(null);

  // Sync user with backend database when Clerk user changes
  useEffect(() => {
    if (!clerkUser || !isClerkLoaded) return;

    const syncUserWithBackend = async () => {
      if (!API_URL) {
        // If no API URL, we're running locally without backend
        return;
      }

      try {
        // Sync user with our database
        const response = await fetch(`${API_URL}/api/auth/callback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: clerkUser.id,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.user?.id) setDbUserId(data.user.id);
          if (data.subscription) setSubscription(data.subscription);
          if (data.settings) setSettings(data.settings);
        }
      } catch (error) {
        console.error("Failed to sync user with backend:", error);
      }
    };

    syncUserWithBackend();
  }, [clerkUser, isClerkLoaded]);

  const refreshUser = useCallback(async () => {
    if (!userId || !API_URL) return;

    try {
      const response = await fetch(`${API_URL}/api/auth/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clerkUserId: userId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.user?.id) setDbUserId(data.user.id);
        if (data.subscription) setSubscription(data.subscription);
        if (data.settings) setSettings(data.settings);
      }
    } catch (error) {
      console.error("Failed to refresh user data:", error);
    }
  }, [userId]);

  const signIn = useCallback(() => {
    openSignIn();
  }, [openSignIn]);

  const signOut = useCallback(async () => {
    setSubscription(null);
    setSettings(null);
    setDbUserId(null);
    await clerkSignOut();
  }, [clerkSignOut]);

  const updateSettings = useCallback(async (newSettings: Partial<UserSettings>) => {
    if (!userId || !API_URL) return;

    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clerkUserId: userId,
          ...newSettings,
        }),
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
  }, [userId, getToken]);

  // Transform Clerk user to our format
  const user = clerkUser ? {
    id: dbUserId || clerkUser.id,
    email: clerkUser.primaryEmailAddress?.emailAddress || "",
    firstName: clerkUser.firstName || undefined,
    lastName: clerkUser.lastName || undefined,
    profilePicture: clerkUser.imageUrl || undefined,
  } : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        subscription,
        settings,
        isLoading: !isClerkLoaded,
        isAuthenticated: !!clerkUser,
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
