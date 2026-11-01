'use client';

import { Button, EmptyState, Skeleton, SkeletonGroup } from '@oneohm/design-system/web';
import { CircleAlert, RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { describeError } from '@/lib/api/api-error';

/** Shown when a screen could not load; says why and offers a retry. */
export function LoadError({
  error,
  onRetry,
  className,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly className?: string;
}) {
  const t = useTranslations('states');
  return (
    <EmptyState
      icon={<CircleAlert />}
      title={t('loadError')}
      description={describeError(error)}
      action={
        <Button variant="secondary" size="sm" leadingIcon={<RotateCw />} onClick={onRetry}>
          {t('retry')}
        </Button>
      }
      {...(className ? { className } : {})}
    />
  );
}

/** A calm placeholder of rows while a list loads. */
export function ListSkeleton({
  label,
  rows = 6,
}: {
  readonly label: string;
  readonly rows?: number;
}) {
  return (
    <SkeletonGroup label={label} className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={`row-${index + 1}`} className="h-16 w-full rounded-xl" />
      ))}
    </SkeletonGroup>
  );
}
