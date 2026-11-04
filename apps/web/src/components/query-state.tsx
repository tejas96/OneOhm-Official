'use client';

import {
  Button,
  cn,
  EmptyState,
  PageHeader,
  Skeleton,
  SkeletonGroup,
} from '@oneohm/design-system/web';
import { CircleAlert, LockKeyhole, RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ApiError, describeError } from '@/lib/api/api-error';

/** The calm "not for your role" note, shown up front when a viewer lacks the right. */
export function NoAccess({ className }: { readonly className?: string }) {
  const t = useTranslations('states');
  return (
    <EmptyState
      icon={<LockKeyhole />}
      title={t('noAccessTitle')}
      description={t('noAccessBody')}
      {...(className ? { className } : {})}
    />
  );
}

/** A whole page for a viewer without the right: only the title and the calm note. */
export function BlockedPage({
  title,
  className,
}: {
  readonly title: string;
  readonly className?: string;
}) {
  return (
    <div className={cn('mx-auto flex w-full max-w-[90rem] flex-col gap-8 py-2', className)}>
      <PageHeader title={title} />
      <NoAccess />
    </div>
  );
}

/** Shown when a screen could not load; says why and offers a retry when it can help. */
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
  // A role without the right gets a calm "not for you" note: retrying cannot help.
  if (error instanceof ApiError && error.status === 403)
    return (
      <EmptyState
        icon={<LockKeyhole />}
        title={t('noAccessTitle')}
        description={t('noAccessBody')}
        {...(className ? { className } : {})}
      />
    );
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
        <Skeleton key={`row-${index + 1}`} className="h-14 w-full rounded-xl" />
      ))}
    </SkeletonGroup>
  );
}
