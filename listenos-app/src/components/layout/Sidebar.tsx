"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home03Icon,
  Book02Icon,
  Scissor01Icon,
  TextFontIcon,
  NoteIcon,
  UserGroupIcon,
  GiftIcon,
  Settings02Icon,
  HelpCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

interface NavItem {
  label: string;
  href: string;
  icon: typeof Home03Icon;
}

const mainNavItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: Home03Icon },
  { label: "Dictionary", href: "/dictionary", icon: Book02Icon },
  { label: "Snippets", href: "/snippets", icon: Scissor01Icon },
  { label: "Tone", href: "/tone", icon: TextFontIcon },
  { label: "Notes", href: "/notes", icon: NoteIcon },
];

interface SidebarProps {
  onSettingsClick: () => void;
}

export function Sidebar({ onSettingsClick }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-56 flex-col border-r border-border bg-sidebar-bg">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex items-center gap-1.5">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-primary"
          >
            <rect x="2" y="8" width="3" height="8" rx="1.5" fill="currentColor" />
            <rect x="7" y="5" width="3" height="14" rx="1.5" fill="currentColor" />
            <rect x="12" y="3" width="3" height="18" rx="1.5" fill="currentColor" />
            <rect x="17" y="6" width="3" height="12" rx="1.5" fill="currentColor" />
          </svg>
          <span className="text-lg font-semibold text-foreground">ListenOS</span>
        </div>
        <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">
          Pro Trial
        </span>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-2">
        <ul className="space-y-1">
          {mainNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-active text-foreground"
                      : "text-muted hover:bg-sidebar-hover hover:text-foreground"
                  )}
                >
                  <HugeiconsIcon
                    icon={item.icon}
                    size={18}
                    className={cn(
                      isActive ? "text-foreground" : "text-muted"
                    )}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom Actions */}
      <div className="border-t border-border px-3 py-3">
        <ul className="space-y-1">
          <li>
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-sidebar-hover hover:text-foreground">
              <HugeiconsIcon icon={UserGroupIcon} size={18} />
              Invite your team
            </button>
          </li>
          <li>
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-sidebar-hover hover:text-foreground">
              <HugeiconsIcon icon={GiftIcon} size={18} />
              Get a free month
            </button>
          </li>
          <li>
            <button
              onClick={onSettingsClick}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-sidebar-hover hover:text-foreground"
            >
              <HugeiconsIcon icon={Settings02Icon} size={18} />
              Settings
            </button>
          </li>
          <li>
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-sidebar-hover hover:text-foreground">
              <HugeiconsIcon icon={HelpCircleIcon} size={18} />
              Help
            </button>
          </li>
        </ul>
      </div>
    </aside>
  );
}

