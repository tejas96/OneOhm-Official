'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { toggleSearch } from './search-store';

/** ⌘K on a Mac, Ctrl+K elsewhere, from anywhere in the app (even inside a text field). */
export function useSearchShortcut(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.altKey || event.shiftKey) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        toggleSearch();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

const noSubscribe = () => () => undefined;

function isApple(): boolean {
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
}

/** Whether to show ⌘K (Apple keyboards) or Ctrl K; the server renders ⌘K. */
export function useAppleKeyboard(): boolean {
  return useSyncExternalStore(noSubscribe, isApple, () => true);
}
