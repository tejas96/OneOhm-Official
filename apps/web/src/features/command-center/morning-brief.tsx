'use client';

import type { CommandCenter } from '@oneohm/api-contracts';
import { Button, ProgressRing } from '@oneohm/design-system/web';
import { formatInrCompact } from '@oneohm/shared';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCan } from '@/providers/current-user';
import { useGreeting } from './use-greeting';

const PARTIES = ['internal', 'customer', 'bank', 'discom'] as const;

function figure(href: string) {
  return (chunks: ReactNode) => (
    <a
      href={href}
      className="text-ink underline decoration-accent/45 decoration-2 underline-offset-[6px] transition-colors hover:decoration-accent"
    >
      {chunks}
    </a>
  );
}

/** The morning brief: the whole business in one paragraph, every figure a way in. */
export function MorningBrief({ data }: { readonly data: CommandCenter }) {
  const t = useTranslations('commandCenter');
  const partyT = useTranslations('commandCenter.party');
  const format = useFormatter();
  const now = useNow();
  const greeting = useGreeting();
  const canQuote = useCan('quotations.create');
  const waitingTotal = PARTIES.reduce((sum, party) => sum + data.waitingDays[party], 0);
  const topParty = [...PARTIES].sort((a, b) => data.waitingDays[b] - data.waitingDays[a])[0];
  return (
    <header className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="font-mono text-[0.75rem] tracking-wide text-ink-faint uppercase">
          {format.dateTime(now, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-2.5">
            <ProgressRing
              value={data.health.score / 100}
              label={t('healthAria', { score: data.health.score })}
              size={40}
              thickness={4}
              paint="brand"
              trackClassName="stroke-hairline"
            >
              <span className="font-mono text-[0.75rem] text-ink">{data.health.score}</span>
            </ProgressRing>
            <span className="type-body-sm text-ink-muted">{t('health')}</span>
          </span>
          {canQuote && (
            <Button asChild variant="primary" size="sm" leadingIcon={<Plus />}>
              <Link href="/quotations/new">{t('newQuotation')}</Link>
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <h1 className="type-display-xl text-ink md:type-hero">{greeting}.</h1>
        <p className="max-w-4xl text-[1.375rem] leading-8 text-pretty text-ink-muted [font-family:var(--font-display)] md:type-display-md">
          {t.rich('brief.money', {
            figure: figure('#money'),
            collected: formatInrCompact(data.collections.collectedPaise),
            due: formatInrCompact(data.collections.duePaise),
          })}{' '}
          {t.rich('brief.actions', { figure: figure('#actions'), count: data.actions.length })}
          {waitingTotal > 0 && topParty && (
            <> {t.rich('brief.waiting', { figure: figure('#waiting'), party: partyT(topParty) })}</>
          )}
        </p>
      </div>
    </header>
  );
}
