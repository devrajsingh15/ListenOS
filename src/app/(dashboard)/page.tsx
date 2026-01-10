"use client";

import { useAuth, SignedIn, SignedOut } from "@/context/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardContent } from "@/components/dashboard/DashboardContent";
import { LandingPage } from "@/components/LandingPage";

export default function DashboardPage() {
  const { isLoading } = useAuth();

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Show landing page for unauthenticated users */}
      <SignedOut>
        <LandingPage />
      </SignedOut>

      {/* Show dashboard for authenticated users */}
      <SignedIn>
        <AppShell>
          <DashboardContent />
        </AppShell>
      </SignedIn>
    </>
  );
}
