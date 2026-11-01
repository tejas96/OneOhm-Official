'use client';

import { useState } from 'react';

/**
 * Shows a long list that is already in hand a step at a time (PRD 9.3, progressive
 * rendering): a gallery of 400 photos draws 48 tiles first and adds more as the person
 * scrolls. Starts over when `resetKey` (the filters) changes.
 */
export function useProgressiveList<T>(all: readonly T[], step: number, resetKey: string) {
  const [state, setState] = useState({ key: resetKey, count: step });
  const count = state.key === resetKey ? state.count : step;
  if (state.key !== resetKey) setState({ key: resetKey, count: step });
  const items = all.length > count ? all.slice(0, count) : all;
  return {
    items,
    total: all.length,
    hasMore: all.length > count,
    loadingMore: false,
    loadMore: () => setState({ key: resetKey, count: count + step }),
  };
}
