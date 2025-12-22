import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "ListenOS - AI Voice Assistant for Desktop",
  description: "Control your computer with natural voice commands. The AI-powered productivity assistant that understands what you mean.",
  keywords: ["voice assistant", "AI", "productivity", "desktop app", "voice commands"],
  openGraph: {
    title: "ListenOS - AI Voice Assistant for Desktop",
    description: "Control your computer with natural voice commands.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "#8b5cf6",
          colorBackground: "#1e293b",
          colorInputBackground: "#0f172a",
          colorInputText: "#f8fafc",
        },
        elements: {
          formButtonPrimary: "bg-violet-600 hover:bg-violet-700",
          card: "bg-slate-800 border border-slate-700",
          headerTitle: "text-white",
          headerSubtitle: "text-slate-400",
          socialButtonsBlockButton: "bg-slate-700 border-slate-600 text-white hover:bg-slate-600",
          formFieldLabel: "text-slate-300",
          formFieldInput: "bg-slate-900 border-slate-600 text-white",
          footerActionLink: "text-violet-400 hover:text-violet-300",
        },
      }}
    >
      <html lang="en" className={inter.variable}>
        <body className="antialiased min-h-screen">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
