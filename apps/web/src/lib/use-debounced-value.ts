'use client';

import { useEffect, useState } from 'react';

/** The value after it has stopped changing for `delayMs` (search boxes). */
export function useDebouncedValue<TValue>(value: TValue, delayMs = 250): TValue {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
