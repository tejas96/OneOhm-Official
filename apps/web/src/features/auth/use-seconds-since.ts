'use client';

import { useEffect, useState } from 'react';

/** Whole seconds since `start` (a Date.now() value), ticking once a second; 0 when null. */
export function useSecondsSince(start: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (start === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [start]);
  return start === null ? 0 : Math.max(0, Math.floor((now - start) / 1000));
}
