'use client';

import type { LivePerson, LiveSite } from '@oneohm/api-contracts';
import { Button } from '@oneohm/design-system/web';
import { ArrowUpRight, Clock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { jobHref } from './live-format';
import { PersonAvatar } from './person-bits';

const STATUS_TONE: Readonly<Record<LiveSite['status'], string>> = {
  planned: 'var(--oh-ink-faint)',
  in_progress: 'var(--oh-duty-visit)',
  done: 'var(--oh-done-solid)',
  late: 'var(--oh-duty-gap)',
};

/** "11:00" from minutes after midnight. */
const clockOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** A customer's site today: the job, who does it, and the way into the job. */
export function SiteCard({
  site,
  people,
  onOpenPerson,
}: {
  readonly site: LiveSite;
  readonly people: readonly LivePerson[];
  readonly onOpenPerson: (id: string) => void;
}) {
  const t = useTranslations('liveMap');
  const crew = site.assigneeIds.flatMap((id) => people.filter((row) => row.person.id === id));
  return (
    <div className="flex flex-col gap-5 px-5 pt-1.5 pb-5">
      <div className="flex flex-col gap-2">
        <span
          style={{ '--tone': STATUS_TONE[site.status] } as CSSProperties}
          className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--tone)_14%,transparent)] px-2.5 py-1 type-label text-ink"
        >
          <span aria-hidden className="size-2 rounded-full bg-(--tone)" />
          {t(`siteStatus.${site.status}`)}
        </span>
        <h2 className="type-title-lg text-ink">{site.label}</h2>
        <p className="type-body-sm text-ink-muted">
          {[site.customerName, site.siteLabel].filter(Boolean).join(', ')}
        </p>
      </div>
      <dl className="flex flex-col gap-2 type-body-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-muted">{t('site.kind')}</dt>
          <dd className="text-ink">{t(`site.kinds.${site.kind}`)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-muted">{t('site.planned')}</dt>
          <dd className="flex items-center gap-1.5 tabular-nums text-ink">
            <Clock aria-hidden className="size-3.5 text-ink-faint" />
            {site.plannedStartMin === null ? t('site.anyTime') : clockOf(site.plannedStartMin)}
          </dd>
        </div>
      </dl>
      <div className="flex flex-col gap-1">
        <p className="type-label text-ink-faint">{t('site.crew')}</p>
        {crew.length === 0 && <p className="type-body-sm text-ink-muted">{t('site.noCrew')}</p>}
        {crew.map((person) => (
          <button
            key={person.person.id}
            type="button"
            onClick={() => onOpenPerson(person.person.id)}
            className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-sunken"
          >
            <PersonAvatar person={person} />
            <span className="type-body text-ink">{person.person.fullName}</span>
          </button>
        ))}
      </div>
      <Button asChild variant="primary" trailingIcon={<ArrowUpRight />}>
        <Link href={jobHref(site)} scroll={false}>
          {t('site.openJob')}
        </Link>
      </Button>
    </div>
  );
}
