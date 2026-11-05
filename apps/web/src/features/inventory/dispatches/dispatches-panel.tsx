'use client';

import type { Dispatch } from '@oneohm/api-contracts';
import { cn, EmptyState, Input, listItemEnter } from '@oneohm/design-system/web';
import { Search, Truck } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { formatPhone } from '@/lib/format/contact';
import { focusRowProps, useFocusRow } from '@/lib/use-focus-row';
import { useSearchParam } from '@/lib/use-search-param';
import { formatQuantity, useDispatches } from '../use-inventory';
import { matchesDispatch } from './dispatch-filters';

/**
 * Delivery challans: what left the store for which site, with serials. `?q=` searches
 * them; `?dispatch=<id>` scrolls to one challan and marks it.
 */
export function DispatchesPanel() {
  const t = useTranslations('inventory.dispatches');
  const dispatches = useDispatches();
  const { draft, setDraft, search } = useSearchParam('q');
  const focused = useFocusRow('dispatch', dispatches.data);
  if (dispatches.isPending) return <ListSkeleton label={t('loading')} />;
  if (dispatches.isError) {
    return <LoadError error={dispatches.error} onRetry={() => dispatches.refetch()} />;
  }
  if (dispatches.data.length === 0) {
    return <EmptyState icon={<Truck />} title={t('emptyTitle')} description={t('emptyBody')} />;
  }
  // A linked challan stays on screen even when the search would hide it.
  const rows = dispatches.data.filter(
    (dispatch) => dispatch.id === focused || matchesDispatch(search, dispatch),
  );
  return (
    <div className="flex flex-col gap-6">
      <div className="min-w-0 flex-1 lg:max-w-sm">
        <Input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('search')}
          aria-label={t('search')}
          leading={<Search aria-hidden />}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Search />} title={t('noMatchTitle')} description={t('noMatchBody')} />
      ) : (
        <ol className="grid gap-4 lg:grid-cols-2">
          {rows.map((dispatch, index) => (
            <motion.li
              key={dispatch.id}
              {...listItemEnter(index)}
              {...focusRowProps(dispatch.id, focused)}
            >
              <DispatchCard dispatch={dispatch} focused={dispatch.id === focused} />
            </motion.li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function DispatchCard({
  dispatch,
  focused = false,
}: {
  readonly dispatch: Dispatch;
  readonly focused?: boolean;
}) {
  const t = useTranslations('inventory.dispatches');
  const format = useFormatter();
  const driver = [dispatch.driverName, dispatch.driverPhone && formatPhone(dispatch.driverPhone)]
    .filter(Boolean)
    .join(' · ');
  return (
    <article
      className={cn(
        'flex h-full flex-col gap-4 rounded-[28px] bg-raised p-6 shadow-e1 ring-1 ring-hairline/70',
        focused && 'ring-2 ring-accent',
      )}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-mono type-body-sm font-medium text-ink">{dispatch.number}</p>
          <Link
            href={`/projects/${dispatch.projectId}?tab=material`}
            className="truncate type-title-lg font-normal text-ink [font-family:var(--font-display)] hover:text-accent"
          >
            {dispatch.projectName}
          </Link>
          <p className="type-label text-ink-faint">
            {dispatch.projectCode} ·{' '}
            {t('from', {
              location: dispatch.locationName,
              date: format.dateTime(new Date(dispatch.dispatchedOn), {
                day: 'numeric',
                month: 'short',
              }),
            })}
          </p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Truck aria-hidden className="size-5" />
        </span>
      </header>
      <ul className="flex flex-col divide-y divide-hairline border-y border-hairline">
        {dispatch.lines.map((line) => (
          <li key={line.productId} className="flex flex-col gap-1 py-2.5">
            <p className="flex justify-between gap-3 type-body-sm text-ink">
              <span className="truncate">{line.name}</span>
              <span className="shrink-0 font-mono tabular-nums">
                {formatQuantity(line.quantity)} {line.unit}
              </span>
            </p>
            {line.serials.length > 0 && (
              <p className="font-mono text-[0.75rem] break-words text-ink-faint">
                {line.serials.join(', ')}
              </p>
            )}
          </li>
        ))}
      </ul>
      {(dispatch.vehicle || driver) && (
        <p className="type-label text-ink-muted">
          {[
            dispatch.vehicle && t('vehicle', { vehicle: dispatch.vehicle }),
            driver && t('driver', { name: driver }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </article>
  );
}
