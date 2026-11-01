import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

// One shared reading for the whole app: every tap target uses this hook.
let reduced = false;
const listeners = new Set<() => void>();
let started = false;

function start() {
  if (started) return;
  started = true;
  const set = (value: boolean) => {
    reduced = value;
    for (const listener of listeners) listener();
  };
  void AccessibilityInfo.isReduceMotionEnabled().then(set);
  AccessibilityInfo.addEventListener('reduceMotionChanged', set);
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Whether the person asked the phone for less motion (PRD 9.3). Animations then jump
 * straight to their end state; nothing waits on them.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => reduced,
    () => false,
  );
}
