'use client';

import { useCallback, useEffect, useState } from 'react';

export interface ScrollEdges {
  /** Columns are hidden past the right edge. */
  readonly moreAfter: boolean;
}

/**
 * Watches a sideways-scrolling frame and says whether more lies past its right
 * edge, so the frame can hint at the columns the reader cannot see yet.
 */
export function useScrollEdges(): readonly [(node: HTMLElement | null) => void, ScrollEdges] {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [moreAfter, setMoreAfter] = useState(false);
  const measure = useCallback((frame: HTMLElement) => {
    setMoreAfter(frame.scrollLeft + frame.clientWidth < frame.scrollWidth - 1);
  }, []);

  useEffect(() => {
    if (!node) return;
    const update = () => measure(node);
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => {
      node.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [node, measure]);

  return [setNode, { moreAfter }] as const;
}
