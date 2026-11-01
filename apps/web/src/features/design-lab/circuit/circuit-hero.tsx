'use client';

import { Badge, Button, Card, easing, ProgressRing, seconds } from '@oneohm/design-system/web';
import { formatInrCompact, formatKwp } from '@oneohm/shared';
import { CalendarDays, FlaskConical, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { PREVIEW } from '../../command-center/preview-data';
import { MONEY } from '../lab-data';
import { useGreeting } from '../use-greeting';
import { StageCircuit } from './stage-circuit';

/** The ocean hero: greeting, the project circuit, and three numbers that matter today. */
export function CircuitHero() {
  const t = useTranslations('lab.circuit');
  const format = useFormatter();
  const now = useNow();
  const greeting = useGreeting();
  const share = MONEY.collected / MONEY.due;
  return (
    <Card tone="panel" className="rounded-[28px]">
      <div className="flex flex-col gap-10 p-6 sm:p-9">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2">
            <p className="flex flex-wrap items-center gap-3 type-body-sm text-on-panel-muted">
              {format.dateTime(now, { weekday: 'long', day: 'numeric', month: 'long' })}
              <Badge className="bg-on-panel/10 text-on-panel">
                <FlaskConical aria-hidden className="size-3.5" />
                {t('previewBadge')}
              </Badge>
            </p>
            <h1 className="type-display-lg text-on-panel md:type-display-xl">{greeting}</h1>
            <p className="type-body text-on-panel-muted">
              {t('summary', { live: 24, needYou: 5 })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="panelQuiet" leadingIcon={<CalendarDays />}>
              {t('period')}
            </Button>
            <Button variant="panel" leadingIcon={<Plus />}>
              {t('newQuotation')}
            </Button>
          </div>
        </header>

        <StageCircuit />

        <dl className="grid gap-6 border-t border-on-panel/12 pt-7 sm:grid-cols-3 sm:gap-0">
          <div className="flex items-center gap-4 sm:pr-6">
            <ProgressRing
              value={PREVIEW.pulse.healthScore / 100}
              label={t('healthAria', { score: PREVIEW.pulse.healthScore })}
              size={60}
              thickness={5}
              paint="brand"
              trackClassName="stroke-on-panel/12"
            >
              <span className="font-mono text-[0.9375rem] text-on-panel">
                {PREVIEW.pulse.healthScore}
              </span>
            </ProgressRing>
            <div className="flex flex-col gap-0.5">
              <dt className="type-label text-on-panel-muted">{t('health')}</dt>
              <dd className="type-title-md text-on-panel">{t('healthy')}</dd>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:border-l sm:border-on-panel/12 sm:px-6">
            <dt className="type-label text-on-panel-muted">{t('collected')}</dt>
            <dd className="flex items-baseline gap-2">
              <span className="type-display-md text-on-panel tabular-nums">
                {formatInrCompact(MONEY.collected)}
              </span>
              <span className="type-body-sm text-on-panel-muted">
                {t('ofDue', { due: formatInrCompact(MONEY.due) })}
              </span>
            </dd>
            <span className="h-1.5 overflow-hidden rounded-full bg-on-panel/12">
              <motion.span
                className="oh-brand-line-x block h-full origin-left rounded-full"
                style={{ width: `${Math.round(share * 100)}%` }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: seconds('data'), ease: easing('outExpo'), delay: 0.4 }}
              />
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:border-l sm:border-on-panel/12 sm:pl-6">
            <dt className="type-label text-on-panel-muted">{t('installed')}</dt>
            <dd className="flex items-baseline gap-2">
              <span className="type-display-md text-on-panel tabular-nums">
                {formatKwp(PREVIEW.pulse.installedWp)}
              </span>
              <span className="type-body-sm text-on-panel-muted">
                {t('systems', { count: PREVIEW.pulse.commissioned })}
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}
