import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Theme } from "@radix-ui/themes";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { ErrorNotification } from "@/components/ErrorNotification";
import "../globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "ListenOS - AI Productivity Assistant",
  description: "Your AI-powered voice productivity assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        <AuthProvider>
          <ToastProvider>
            <Theme accentColor="violet" grayColor="slate" radius="medium">
              {children}
              <ErrorNotification />
            </Theme>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
