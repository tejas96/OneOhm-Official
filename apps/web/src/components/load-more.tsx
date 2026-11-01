'use client';

import { Button, cn } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

/**
 * The foot of a long list: how many of how many show, and "Show more". The next page
 * also loads by itself as the person scrolls near the end (PRD 9.3); the button stays
 * for keyboards and screen readers. Shows nothing once everything is on screen.
 */
export function LoadMore({
  shown,
  total,
  hasMore,
  loading,
  onMore,
  className,
}: {
  readonly shown: number;
  readonly total: number;
  readonly hasMore: boolean;
  readonly loading: boolean;
  readonly onMore: () => void;
  readonly className?: string;
}) {
  const t = useTranslations('lists');
  const sentinel = useRef<HTMLDivElement>(null);
  const more = useRef(onMore);
  more.current = onMore;

  useEffect(() => {
    const node = sentinel.current;
    if (!hasMore || !node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) more.current();
      },
      { rootMargin: '0px 0px 480px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore]);

  if (!hasMore) return null;
  return (
    <div
      ref={sentinel}
      className={cn('flex flex-col items-center gap-2.5 pt-2 pb-4 text-center', className)}
    >
      <p className="type-body-sm text-ink-faint tabular-nums" aria-live="polite">
        {t('showing', { shown, total })}
      </p>
      <Button variant="secondary" size="sm" pending={loading} onClick={onMore}>
        {t('more')}
      </Button>
    </div>
  );
}
