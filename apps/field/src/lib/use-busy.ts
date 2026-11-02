import { useCallback, useRef, useState } from 'react';

/**
 * Runs one job at a time (a picker, a removal): taps while it runs are ignored, and
 * `busy` lets the buttons show it.
 */
export function useBusy(): {
  readonly busy: boolean;
  readonly run: (job: () => Promise<void>) => Promise<void>;
} {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (job: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await job();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, run };
}
