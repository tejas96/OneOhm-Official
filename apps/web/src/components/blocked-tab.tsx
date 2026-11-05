'use client';

import { Button, EmptyState } from '@oneohm/design-system/web';
import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * A link asked for a tab this person's role cannot open (an approval's "Open", an alert).
 * Say so plainly, instead of quietly showing another tab as if it were the one asked for.
 */
export function BlockedTab({
  tab,
  fallback,
  onFallback,
}: {
  readonly tab: string;
  /** The first tab they can open, if any. */
  readonly fallback: string | null;
  readonly onFallback: () => void;
}) {
  const t = useTranslations('tabAccess');
  return (
    <EmptyState
      icon={<Lock />}
      title={t('title', { tab })}
      description={t('body')}
      action={
        fallback && (
          <Button variant="secondary" onClick={onFallback}>
            {t('action', { tab: fallback })}
          </Button>
        )
      }
    />
  );
}
