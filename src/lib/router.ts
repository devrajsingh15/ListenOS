import { useSyncExternalStore } from "react";

function normalizePath(pathname: string) {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  if (path === "/") return path;
  return `/${path.replace(/^\/+|\/+$/g, "")}`;
}

function usesHashRouting() {
  return window.location.protocol === "app:";
}

export function getPathname() {
  if (usesHashRouting()) {
    return normalizePath(window.location.hash.slice(1));
  }

  return normalizePath(window.location.pathname);
}

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener("hashchange", listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener("hashchange", listener);
  };
}

export function usePathname() {
  return useSyncExternalStore(subscribe, getPathname, () => "/");
}

export function navigate(pathname: string) {
  const nextPath = normalizePath(pathname);

  if (usesHashRouting()) {
    window.location.hash = nextPath;
    return;
  }

  if (nextPath === getPathname()) return;
  window.history.pushState({}, "", nextPath);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
