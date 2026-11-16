'use client';

import type { DutyAlert } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { CircleCheckBig } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useNow } from '../use-live';
import { sortAlerts } from './alert-format';
import { AlertItem } from './alert-item';
import { useLiveAlerts, useResolveAlert, useSeeAlert } from './use-alerts';

export interface AlertActions {
  readonly onFocus: (alert: DutyAlert) => void;
  readonly onOpenDay: (alert: DutyAlert) => void;
  readonly onSendNearest: (alert: DutyAlert) => void;
}

/**
 * The Alerts tab: red then amber, newest first. A new alert slides in at its place; a
 * resolved one folds away. The focused one (picked here, on the map, or from a notice) is
 * outlined and scrolled into view.
 */
export function AlertFeed({
  focusedId,
  ...actions
}: AlertActions & { readonly focusedId: string | null }) {
  const t = useTranslations('liveMap.alerts');
  const query = useLiveAlerts();
  const see = useSeeAlert();
  const resolve = useResolveAlert();
  const toast = useToast();
  const now = useNow(30_000);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!focusedId) return;
    list.current
      ?.querySelector(`[data-alert="${focusedId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedId]);
  if (query.isPending)
    return (
      <div className="px-5 py-4">
        <ListSkeleton label={t('loading')} rows={3} />
      </div>
    );
  if (query.isError)
    return (
      <div className="px-5 py-4">
        <LoadError error={query.error} onRetry={() => query.refetch()} />
      </div>
    );
  const alerts = sortAlerts(query.data.alerts);
  if (alerts.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 px-8 py-12 text-center">
        <span className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-energy-soft text-on-track">
          <CircleCheckBig aria-hidden className="size-6" />
        </span>
        <p className="type-title-md text-ink">{t('none.title')}</p>
        <p className="type-body-sm text-ink-muted">{t('none.body')}</p>
      </div>
    );
  return (
    <ul ref={list} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pt-1 pb-4">
      <AnimatePresence initial={false}>
        {alerts.map((alert) => (
          <motion.li
            key={alert.id}
            data-alert={alert.id}
            layout="position"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 32, transition: { duration: 0.2 } }}
            transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
          >
            <AlertItem
              alert={alert}
              now={now}
              focused={alert.id === focusedId}
              onFocus={() => actions.onFocus(alert)}
              onOpenDay={() => actions.onOpenDay(alert)}
              onSendNearest={() => actions.onSendNearest(alert)}
              onSeen={() => see.mutate(alert.id)}
              onResolve={() =>
                resolve.mutate(alert.id, {
                  onSuccess: () => toast({ title: t('resolved'), tone: 'success' }),
                  onError: () => toast({ title: t('resolveFailed'), tone: 'error' }),
                })
              }
            />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
