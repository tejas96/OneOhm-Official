'use client';

import { Badge, Button, ProgressRing } from '@oneohm/design-system/web';
import { formatInrCompact } from '@oneohm/shared';
import { FlaskConical, Plus } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { PREVIEW } from '../../command-center/preview-data';
import { MONEY } from '../lab-data';
import { useGreeting } from '../use-greeting';

const figure = (chunks: ReactNode) => (
  <a
    href="#ledger"
    className="text-ink underline decoration-accent/45 decoration-2 underline-offset-[6px] transition-colors hover:decoration-accent"
  >
    {chunks}
  </a>
);

/** The morning brief: the whole business in one paragraph, every figure a way in. */
export function Lede() {
  const t = useTranslations('lab.editorial');
  const format = useFormatter();
  const now = useNow();
  const greeting = useGreeting();
  return (
    <header className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="flex flex-wrap items-center gap-3 font-mono text-[0.75rem] tracking-wide text-ink-faint uppercase">
          {format.dateTime(now, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
          <Badge variant="accent" className="font-sans tracking-normal normal-case">
            <FlaskConical aria-hidden className="size-3.5" />
            {t('previewBadge')}
          </Badge>
        </p>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-2.5">
            <ProgressRing
              value={PREVIEW.pulse.healthScore / 100}
              label={t('healthAria', { score: PREVIEW.pulse.healthScore })}
              size={40}
              thickness={4}
              paint="brand"
              trackClassName="stroke-hairline"
            >
              <span className="font-mono text-[0.75rem] text-ink">{PREVIEW.pulse.healthScore}</span>
            </ProgressRing>
            <span className="type-body-sm text-ink-muted">{t('health')}</span>
          </span>
          <Button variant="primary" size="sm" leadingIcon={<Plus />}>
            {t('newQuotation')}
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <h1 className="type-display-xl text-ink md:type-hero">{greeting}.</h1>
        <p className="max-w-4xl type-display-md text-pretty text-ink-muted">
          {t.rich('brief', {
            figure,
            collected: formatInrCompact(MONEY.collected),
            due: formatInrCompact(MONEY.due),
            actions: 5,
            party: 'DISCOM',
          })}
        </p>
      </div>
    </header>
  );
}
