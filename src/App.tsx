import { useEffect } from "react";
import { Theme } from "@radix-ui/themes";
import { ErrorNotification } from "@/components/ErrorNotification";
import { SettingsProvider } from "@/context/SettingsContext";
import { ToastProvider } from "@/context/ToastContext";
import { usePathname } from "@/lib/router";
import DashboardPage from "@/app/(dashboard)/page";
import ClipboardPage from "@/app/(dashboard)/clipboard/page";
import CommandsPage from "@/app/(dashboard)/commands/page";
import ConversationPage from "@/app/(dashboard)/conversation/page";
import DictionaryPage from "@/app/(dashboard)/dictionary/page";
import IntegrationsPage from "@/app/(dashboard)/integrations/page";
import SnippetsPage from "@/app/(dashboard)/snippets/page";
import TonePage from "@/app/(dashboard)/tone/page";
import AssistantPage from "@/app/(overlay)/assistant/page";

const routes: Record<string, React.ComponentType> = {
  "/": DashboardPage,
  "/clipboard": ClipboardPage,
  "/commands": CommandsPage,
  "/conversation": ConversationPage,
  "/dictionary": DictionaryPage,
  "/integrations": IntegrationsPage,
  "/snippets": SnippetsPage,
  "/tone": TonePage,
};

export default function App() {
  const pathname = usePathname();
  const assistantMode = pathname === "/assistant";

  useEffect(() => {
    document.documentElement.classList.toggle("assistant-mode", assistantMode);
    document.documentElement.classList.toggle("dark", assistantMode);
    document.body.className = assistantMode
      ? "assistant-mode"
      : "bg-background font-sans text-foreground antialiased";
  }, [assistantMode]);

  if (assistantMode) return <AssistantPage />;

  const Page = routes[pathname] ?? DashboardPage;
  return (
    <SettingsProvider>
      <ToastProvider>
        <Theme appearance="inherit" accentColor="blue" grayColor="gray" radius="small">
          <Page />
          <ErrorNotification />
        </Theme>
      </ToastProvider>
    </SettingsProvider>
  );
}
