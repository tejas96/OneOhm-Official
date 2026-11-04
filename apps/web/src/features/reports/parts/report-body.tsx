'use client';

import { cn, EmptyState, Skeleton, SkeletonGroup } from '@oneohm/design-system/web';
import type { UseQueryResult } from '@tanstack/react-query';
import { ChartNoAxesColumn } from 'lucide-react';
import type { ReactNode } from 'react';
import { LoadError } from '@/components/query-state';

/**
 * Loading, failure and the dimmed "updating" state every report shares. Children render
 * only with data; `empty` replaces them when nothing happened for these filters.
 */
export function ReportBody<T>({
  query,
  label,
  isEmpty,
  empty,
  children,
}: {
  readonly query: UseQueryResult<T>;
  readonly label: string;
  readonly isEmpty: (data: T) => boolean;
  readonly empty: { readonly title: string; readonly description: string };
  readonly children: (data: T) => ReactNode;
}) {
  if (query.isPending) {
    return (
      <SkeletonGroup label={label} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((tile) => (
            <Skeleton key={tile} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </SkeletonGroup>
    );
  }
  if (query.isError && !query.data) {
    return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  }
  const data = query.data;
  if (data === undefined) return null;
  return (
    <div
      aria-busy={query.isPlaceholderData}
      className={cn(
        'flex flex-col gap-6 transition-opacity',
        query.isPlaceholderData && 'opacity-60',
      )}
    >
      {isEmpty(data) ? (
        <EmptyState
          icon={<ChartNoAxesColumn />}
          title={empty.title}
          description={empty.description}
        />
      ) : (
        children(data)
      )}
    </div>
  );
}

/** Two or more parts of one whole on a track. Purely visual: the numbers sit beside it. */
export function SplitBar({
  parts,
  total,
  className,
}: {
  readonly parts: readonly {
    readonly key: string;
    readonly value: number;
    readonly fill: string;
  }[];
  readonly total?: number;
  readonly className?: string;
}) {
  const sum = parts.reduce((acc, part) => acc + part.value, 0);
  const length = Math.max(total ?? sum, 1);
  return (
    <span
      aria-hidden
      className={cn('flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-sunken', className)}
    >
      {parts.map((part) =>
        part.value > 0 ? (
          <span
            key={part.key}
            className={cn('h-full shrink-0', part.fill)}
            style={{ width: `${((part.value / length) * 100).toFixed(2)}%` }}
          />
        ) : null,
      )}
    </span>
  );
}

/** Figures in tables: mono, aligned digits. */
export const NUM = 'font-mono text-[0.8125rem] tabular-nums';

/** A short explanation of how the numbers were counted, under every report. */
export function ReportNote({ children }: { readonly children: ReactNode }) {
  return <p className="max-w-4xl type-body-sm text-ink-faint">{children}</p>;
}
