'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether the "Jump to…" palette is open. One palette serves the whole app and is
 * opened from the sidebar, the phone bar, the phone menu and ⌘K, so its state lives
 * outside any one of them.
 */
let open = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSearchOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const listener of listeners) listener();
}

export function openSearch(): void {
  setSearchOpen(true);
}

export function toggleSearch(): void {
  setSearchOpen(!open);
}

export function useSearchOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}
