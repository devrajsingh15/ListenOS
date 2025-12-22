"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Processing authentication...");

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");

      if (error) {
        setStatus("error");
        setMessage(`Authentication failed: ${error}`);
        return;
      }

      if (!code) {
        setStatus("error");
        setMessage("No authorization code received");
        return;
      }

      // Verify state matches (CSRF protection)
      const savedState = sessionStorage.getItem("workos_state");
      if (state && savedState && state !== savedState) {
        setStatus("error");
        setMessage("Security validation failed. Please try again.");
        return;
      }

      try {
        // In production, you would exchange this code on your backend
        // For now, we'll simulate a successful authentication
        // Your backend would call: POST https://api.workos.com/user_management/authenticate
        
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Mock user data (in production, this comes from WorkOS API response)
        const mockUser = {
          id: "user_" + Date.now(),
          email: "user@listenos.app",
          firstName: "ListenOS",
          lastName: "User",
        };

        // Store in localStorage (AuthContext will pick this up)
        localStorage.setItem("listenos_auth", JSON.stringify({
          user: mockUser,
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        }));

        // Clean up
        sessionStorage.removeItem("workos_state");

        setStatus("success");
        setMessage("Authentication successful! Redirecting...");

        // Redirect to dashboard
        setTimeout(() => {
          router.push("/");
        }, 1500);

      } catch (err) {
        console.error("Auth callback error:", err);
        setStatus("error");
        setMessage("Failed to complete authentication. Please try again.");
      }
    };

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        {status === "loading" && (
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-lg text-foreground">{message}</p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
              <svg className="h-6 w-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg text-foreground">{message}</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
              <svg className="h-6 w-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-lg text-foreground">{message}</p>
            <button
              onClick={() => router.push("/")}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              Return to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-lg text-foreground">Loading...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AuthCallbackContent />
    </Suspense>
  );
}

