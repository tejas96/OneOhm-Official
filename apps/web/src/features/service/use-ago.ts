'use client';

import { useFormatter, useNow } from 'next-intl';

/**
 * "5 minutes ago" for a server time. The clock ticks every 15 s, so a message fresher than the
 * last tick is held at "now" instead of reading as in the future.
 */
export function useAgo(style: 'long' | 'short' = 'long') {
  const format = useFormatter();
  const now = useNow({ updateInterval: 15_000 });
  return (at: string) => {
    const time = Math.min(Date.parse(at), now.getTime());
    return format.relativeTime(time, { now, style });
  };
}
