import { useEffect, useRef, useState, type ComponentType } from "react";
import type { IconProps } from "@solar-icons/react";
import {
  AltArrowDown,
  Book,
  ChatRound,
  ClipboardText,
  Command,
  HomeSmile,
  PlugCircle,
  Scissors,
  Text,
} from "@solar-icons/react";
import { cn } from "@/lib/utils";
import { navigate, usePathname } from "@/lib/router";

type WorkspaceIcon = ComponentType<IconProps>;

interface WorkspaceItem {
  description: string;
  href: string;
  icon: WorkspaceIcon;
  label: string;
}

const WORKSPACES: WorkspaceItem[] = [
  { href: "/", label: "Dashboard", description: "Overview and recent activity", icon: HomeSmile },
  { href: "/conversation", label: "Conversation", description: "Talk with your AI assistant", icon: ChatRound },
  { href: "/commands", label: "Custom Commands", description: "Build reusable voice actions", icon: Command },
  { href: "/clipboard", label: "Clipboard", description: "Review captured clipboard history", icon: ClipboardText },
  { href: "/integrations", label: "Integrations", description: "Connect external tools and services", icon: PlugCircle },
  { href: "/dictionary", label: "Dictionary", description: "Teach ListenOS custom words", icon: Book },
  { href: "/snippets", label: "Snippets", description: "Create shortcuts for reusable text", icon: Scissors },
  { href: "/tone", label: "Style", description: "Set writing tone and preferences", icon: Text },
];

export function WorkspaceMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const activeWorkspace = WORKSPACES.find((workspace) => workspace.href === pathname) ?? WORKSPACES[0];

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleNavigation = (href: string) => {
    setIsOpen(false);
    navigate(href);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((open) => !open)}
        className="ui-button desktop-no-drag flex h-8 max-w-[190px] items-center gap-1.5 rounded-df border border-border bg-muted px-2.5 text-[13px] font-normal text-foreground shadow-sm transition-colors hover:bg-accent sm:max-w-none"
      >
        <span className="truncate">{activeWorkspace.label}</span>
        <AltArrowDown
          size={14}
          weight="Bold"
          className={cn("shrink-0 text-muted-foreground transition-transform duration-150", isOpen && "rotate-180")}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="Workspace navigation"
          className="ui-surface-panel desktop-no-drag absolute left-0 top-[calc(100%+6px)] z-[80] w-[min(290px,calc(100vw-24px))] overflow-hidden p-1 shadow-2xl"
        >
          <p className="px-1.5 pb-1 pt-0.5 text-[9px] font-normal uppercase tracking-[0.14em] text-muted-foreground">
            Workspace
          </p>
          <div className="max-h-[min(360px,calc(100vh-82px))] space-y-px overflow-y-auto">
            {WORKSPACES.map((workspace) => {
              const active = workspace.href === activeWorkspace.href;
              const Icon = workspace.icon;

              return (
                <button
                  key={workspace.href}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => handleNavigation(workspace.href)}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-df px-1.5 py-1 text-left transition-colors",
                    active ? "bg-accent" : "hover:bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-df border transition-colors",
                      active
                        ? "border-primary/20 bg-primary/10 text-primary"
                        : "border-muted-border bg-background text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    <Icon size={14} weight="Bold" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-normal leading-4 text-foreground">{workspace.label}</span>
                    <span className="block truncate text-[10px] leading-3.5 text-muted-foreground">{workspace.description}</span>
                  </span>
                  {active && (
                    <span className="rounded-df border border-border bg-background px-1 py-0.5 text-[8px] uppercase tracking-[0.08em] text-muted-foreground">
                      Active
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
