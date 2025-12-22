import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center">
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
        </div>
      </header>

      {/* Sign Up Form */}
      <main className="flex-1 flex items-center justify-center py-12">
        <div className="w-full max-w-md px-6">
          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in"
            afterSignUpUrl="/"
          />
        </div>
      </main>
    </div>
  );
}
