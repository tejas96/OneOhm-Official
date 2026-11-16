'use client';

import type { LivePerson } from '@oneohm/api-contracts';
import { Button } from '@oneohm/design-system/web';
import {
  BatteryCharging,
  BatteryLow,
  BatteryMedium,
  Home,
  MessageCircle,
  Phone,
  Signal,
  TriangleAlert,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { whatsappHref } from './live-format';
import { PersonAvatar, StateTag, useDoing, useLastSeen } from './person-bits';
import { useNow } from './use-live';

function BatteryIcon({ percent, charging }: { percent: number; charging: boolean | null }) {
  if (charging) return <BatteryCharging aria-hidden className="size-4 text-energy" />;
  if (percent <= 20) return <BatteryLow aria-hidden className="size-4 text-overdue" />;
  return <BatteryMedium aria-hidden className="size-4 text-ink-muted" />;
}

const NETWORK_ICON = { wifi: Wifi, cellular: Signal, none: WifiOff } as const;

/** One person's day at a glance, with the two ways to reach them. */
export function PersonCard({ person }: { readonly person: LivePerson }) {
  const t = useTranslations('liveMap.card');
  const format = useFormatter();
  const now = useNow(15_000);
  const doing = useDoing();
  const seen = useLastSeen()(person, now);
  const { today, position } = person;
  const clock = (iso: string) =>
    format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit' });
  const network = position?.network as keyof typeof NETWORK_ICON | null | undefined;
  const NetworkIcon = network ? NETWORK_ICON[network] : null;
  return (
    <div className="flex flex-col gap-5 px-5 pt-1.5 pb-5">
      <div className="flex items-center gap-4">
        <PersonAvatar person={person} size="lg" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="truncate type-title-lg text-ink">{person.person.fullName}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <StateTag person={person} />
            {person.person.roleLabel && (
              <span className="type-label text-ink-faint">{person.person.roleLabel}</span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-sunken/70 px-4 py-3">
        <p className="type-body text-ink">{doing(person, now)}</p>
        {today.currentVisit && (
          <p className="mt-0.5 flex items-center gap-1.5 type-body-sm text-ink-muted">
            <Home aria-hidden className="size-3.5" />
            {t('since', { time: clock(today.currentVisit.since) })}
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline">
        <Stat label={t('visits')}>
          <span className="font-display text-[1.75rem] leading-none">{today.visitsDone}</span>
          <span className="text-ink-faint"> / {today.visitsPlanned}</span>
        </Stat>
        <Stat label={t('km')}>
          {today.kmSoFar === null ? (
            <span className="text-ink-faint">{t('unknown')}</span>
          ) : (
            <>
              <span className="font-display text-[1.75rem] leading-none">
                {today.kmSoFar.toFixed(1)}
              </span>
              <span className="text-ink-faint"> km</span>
            </>
          )}
        </Stat>
        <Stat label={t('battery')}>
          {position?.batteryPercent != null ? (
            <span className="flex items-center gap-1.5">
              <BatteryIcon percent={position.batteryPercent} charging={position.charging} />
              {position.batteryPercent}%
            </span>
          ) : (
            <span className="text-ink-faint">{t('unknown')}</span>
          )}
        </Stat>
        <Stat label={t('network')}>
          {NetworkIcon ? (
            <span className="flex items-center gap-1.5">
              <NetworkIcon aria-hidden className="size-4 text-ink-muted" />
              {t(`networks.${network}`)}
            </span>
          ) : (
            <span className="text-ink-faint">{t('unknown')}</span>
          )}
        </Stat>
      </dl>

      <dl className="flex flex-col gap-2 type-body-sm">
        <Row label={t('lastSeen')} value={seen ?? t('notSeen')} />
        <Row
          label={t('dutyStarted')}
          value={today.dutyStartedAt ? clock(today.dutyStartedAt) : t('notStarted')}
        />
      </dl>

      {person.flags.mockedToday && (
        <p className="flex items-start gap-2 rounded-xl bg-overdue-tint px-3 py-2.5 type-body-sm text-overdue">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t('mocked')}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {person.person.phone ? (
          <>
            <Button asChild variant="primary" leadingIcon={<Phone />}>
              <a href={`tel:${person.person.phone}`}>{t('call')}</a>
            </Button>
            <Button asChild leadingIcon={<MessageCircle />}>
              <a href={whatsappHref(person.person.phone)} target="_blank" rel="noreferrer">
                {t('whatsapp')}
              </a>
            </Button>
          </>
        ) : (
          <p className="col-span-2 type-body-sm text-ink-muted">{t('noPhone')}</p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 bg-raised px-4 py-3">
      <dt className="type-label text-ink-faint">{label}</dt>
      <dd className="type-body tabular-nums text-ink">{children}</dd>
    </div>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular-nums text-ink">{value}</dd>
    </div>
  );
}
