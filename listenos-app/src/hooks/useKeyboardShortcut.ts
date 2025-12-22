"use client";

import { useEffect, useCallback } from "react";

interface KeyboardShortcutOptions {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  preventDefault?: boolean;
}

export function useKeyboardShortcut(
  options: KeyboardShortcutOptions,
  callback: () => void
) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const {
        key,
        ctrlKey = false,
        shiftKey = false,
        altKey = false,
        metaKey = false,
        preventDefault = true,
      } = options;

      const keyMatches = event.key.toLowerCase() === key.toLowerCase();
      const ctrlMatches = event.ctrlKey === ctrlKey;
      const shiftMatches = event.shiftKey === shiftKey;
      const altMatches = event.altKey === altKey;
      const metaMatches = event.metaKey === metaKey;

      if (
        keyMatches &&
        ctrlMatches &&
        shiftMatches &&
        altMatches &&
        metaMatches
      ) {
        if (preventDefault) {
          event.preventDefault();
        }
        callback();
      }
    },
    [options, callback]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}

