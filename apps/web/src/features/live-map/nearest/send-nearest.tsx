'use client';

import type { LiveSite, NearestPeople } from '@oneohm/api-contracts';
import { Button, Dialog } from '@oneohm/design-system/web';
import { CircleCheckBig, Navigation, Send, UserRoundSearch } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useAssignSite, useNearest } from '../alerts/use-alerts';

type Nearest = NearestPeople['people'][number];

/** Late, missed or planned work can go to someone close by; done or started work cannot. */
export const canSendTo = (site: LiveSite) => site.status === 'late' || site.status === 'planned';

const distance = (metres: number) =>
  metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;

/**
 * Send nearest: the up-to-five free people closest to the site, with how far and about how
 * long, and one tap to give them the job (after a confirm). Then a clear done state.
 */
export function SendNearest({
  site,
  open,
  onOpen,
}: {
  readonly site: LiveSite;
  readonly open: boolean;
  readonly onOpen: () => void;
}) {
  const t = useTranslations('liveMap.nearest');
  const query = useNearest(open ? site.id : null);
  const assign = useAssignSite();
  const [asking, setAsking] = useState<Nearest | null>(null);
  const [sent, setSent] = useState<Nearest | null>(null);
  if (sent)
    return (
      <div className="flex items-start gap-3 rounded-xl bg-energy-soft px-4 py-3" role="status">
        <CircleCheckBig aria-hidden className="mt-0.5 size-5 shrink-0 text-on-track" />
        <div className="flex flex-col gap-0.5">
          <p className="type-body font-medium text-ink">
            {t('sent', { name: sent.person.fullName })}
          </p>
          <p className="type-body-sm text-ink-muted">{t('sentNote')}</p>
        </div>
      </div>
    );
  if (!open)
    return (
      <Button variant="secondary" leadingIcon={<UserRoundSearch />} onClick={onOpen}>
        {t('open')}
      </Button>
    );
  const people = query.data?.people ?? [];
  return (
    <section className="flex flex-col gap-2" aria-labelledby="nearest-title">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="nearest-title" className="type-label text-ink-faint">
          {t('title')}
        </h3>
        <span className="type-label text-ink-faint">{t('straightLine')}</span>
      </div>
      {query.isPending && <ListSkeleton label={t('loading')} rows={3} />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
      {query.data && people.length === 0 && (
        <p className="rounded-xl bg-sunken px-4 py-3 type-body-sm text-ink-muted">{t('none')}</p>
      )}
      <ul className="flex flex-col divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
        {people.map((row, index) => (
          <li key={row.person.id} className="flex items-center gap-3 bg-raised px-3 py-2.5">
            <span
              aria-hidden
              className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-semibold text-on-accent bg-swatch-${row.person.avatarSwatch % 6}`}
            >
              {row.person.initials}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1.5 truncate type-body-sm font-medium text-ink">
                {row.person.fullName}
                {index === 0 && (
                  <span className="rounded-full bg-accent-soft px-1.5 type-label text-on-accent-soft">
                    {t('closest')}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1 type-label tabular-nums text-ink-muted">
                <Navigation aria-hidden className="size-3" />
                {t('away', { distance: distance(row.distanceM), minutes: row.etaMinutes })}
              </span>
            </span>
            <Button
              size="sm"
              variant={index === 0 ? 'primary' : 'secondary'}
              onClick={() => setAsking(row)}
            >
              {t('assign')}
            </Button>
          </li>
        ))}
      </ul>
      <Dialog
        open={asking !== null}
        onOpenChange={(next) => !next && setAsking(null)}
        size="sm"
        title={t('confirm.title', { name: asking?.person.fullName ?? '' })}
        description={t('confirm.body', {
          name: asking?.person.fullName ?? '',
          job: site.label,
          place: site.customerName ?? site.siteLabel,
        })}
        footer={
          <>
            <Button variant="quiet" onClick={() => setAsking(null)}>
              {t('confirm.cancel')}
            </Button>
            <Button
              variant="primary"
              leadingIcon={<Send />}
              pending={assign.isPending}
              onClick={() => {
                const who = asking;
                if (!who) return;
                assign.mutate(
                  { siteId: site.id, userId: who.person.id },
                  {
                    onSuccess: () => {
                      setAsking(null);
                      setSent(who);
                    },
                  },
                );
              }}
            >
              {t('confirm.assign')}
            </Button>
          </>
        }
      >
        {assign.isError && <LoadError error={assign.error} onRetry={() => assign.reset()} />}
      </Dialog>
    </section>
  );
}
