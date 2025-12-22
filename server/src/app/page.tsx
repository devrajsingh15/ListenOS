import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-slate-800 bg-slate-900/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <span className="text-xl font-semibold text-white">ListenOS</span>
          </Link>

          {/* Auth Buttons */}
          <div className="flex items-center gap-4">
            <SignedOut>
              <Link
                href="/sign-in"
                className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                className="text-sm font-medium px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
              >
                Get Started
              </Link>
            </SignedOut>
            <SignedIn>
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: "w-9 h-9",
                  },
                }}
              />
            </SignedIn>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center pt-16">
        <div className="max-w-6xl mx-auto px-6 py-24 text-center">
          {/* Gradient Background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-r from-violet-600/20 via-blue-600/20 to-purple-600/20 rounded-full blur-3xl animate-gradient" />
          </div>

          {/* Content */}
          <div className="relative z-10">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700 text-sm text-slate-300 mb-8">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Now available for Windows
            </div>

            {/* Headline */}
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
              Your AI Voice Assistant
              <br />
              <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                for Desktop
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-12">
              Control your computer with natural voice commands. 
              Search the web, open apps, manage clipboard, and boost your productivity — 
              all hands-free.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition-all hover:scale-105 glow"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download for Windows
              </Link>
              <a
                href="https://github.com/EvidentSphere/ListenOS"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-slate-800 text-white font-semibold hover:bg-slate-700 transition-all border border-slate-700"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                </svg>
                View on GitHub
              </a>
            </div>

            {/* Features Preview */}
            <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
              <FeatureCard
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                }
                title="Voice Commands"
                description="Speak naturally and let AI understand your intent. No memorizing complex commands."
              />
              <FeatureCard
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                }
                title="Lightning Fast"
                description="Local processing with cloud AI. Get responses in milliseconds, not seconds."
              />
              <FeatureCard
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                }
                title="Privacy First"
                description="Your voice data stays on your device. We never store recordings."
              />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} ListenOS. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
              Privacy
            </a>
            <a href="#" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
              Terms
            </a>
            <a 
              href="https://github.com/EvidentSphere/ListenOS" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 transition-colors">
      <div className="w-12 h-12 rounded-xl bg-violet-600/20 flex items-center justify-center text-violet-400 mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-slate-400">{description}</p>
    </div>
  );
}
