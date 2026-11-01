'use client';

import {
  Button,
  Card,
  cn,
  easing,
  ProgressRing,
  StatusGlyph,
  type StatusGlyphName,
  seconds,
  useCountUp,
} from '@oneohm/design-system/web';
import { formatInrCompact, formatKwp } from '@oneohm/shared';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { type NeedsYouItem, PREVIEW } from './preview-data';

const NEEDS_GLYPH: Readonly<Record<string, StatusGlyphName>> = {
  review: 'review',
  waiting: 'waiting',
  overdue: 'overdue',
  atRisk: 'atRisk',
};

/** The one solar-glass moment: business health, money in this month, and what needs the owner. */
export function PulsePanel() {
  const t = useTranslations('commandCenter.pulse');
  const { pulse } = PREVIEW;
  const score = useCountUp(pulse.healthScore);
  const collectedShare = pulse.collectedPaise / pulse.duePaise;
  return (
    <Card tone="panel" aria-labelledby="pulse-title" className="rounded-2xl">
      <h2 id="pulse-title" className="sr-only">
        {t('title')}
      </h2>
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-12 lg:gap-0">
        <div className="flex flex-col gap-5 lg:col-span-5 lg:pr-8">
          <p className="type-overline text-on-panel-muted uppercase">{t('healthLabel')}</p>
          <div className="flex items-center gap-6">
            <ProgressRing
              value={pulse.healthScore / 100}
              label={t('healthAria', { score: pulse.healthScore })}
              size={140}
              thickness={9}
              paint="brand"
              trackClassName="stroke-on-panel/12"
            >
              <span className="type-display-xl text-on-panel tabular-nums">
                {Math.round(score)}
              </span>
              <span className="mt-1 type-label text-on-panel-muted">{t('outOf')}</span>
            </ProgressRing>
            <div className="flex flex-col gap-3">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-green/20 px-2.5 py-1 type-label text-on-panel">
                <span aria-hidden className="size-1.5 rounded-full bg-brand-green" />
                {t('healthy')}
              </span>
              <p className="max-w-[16rem] type-body text-on-panel-muted">{t('healthSentence')}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="panel" size="sm" trailingIcon={<ArrowRight />}>
              {t('reviewProjects')}
            </Button>
            <Button variant="panelQuiet" size="sm">
              {t('howScored')}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-on-panel/12 lg:col-span-4 lg:border-l lg:px-8">
          <p className="type-overline text-on-panel-muted uppercase">{t('collectedLabel')}</p>
          <p className="type-hero text-on-panel tabular-nums">
            {formatInrCompact(pulse.collectedPaise)}
          </p>
          <p className="type-body-sm text-on-panel-muted">
            {t('collectedOf', { due: formatInrCompact(pulse.duePaise) })}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-on-panel/12">
            <motion.div
              className="oh-brand-line-x h-full origin-left rounded-full"
              style={{ width: `${Math.round(collectedShare * 100)}%` }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: seconds('data'), ease: easing('outExpo'), delay: 0.2 }}
            />
          </div>
          <WeeklyBars values={PREVIEW.money.weeklyCollections} />
          <dl className="mt-auto grid grid-cols-2 gap-4 pt-2">
            <PanelStat label={t('installed')} value={formatKwp(pulse.installedWp)} />
            <PanelStat
              label={t('commissioned')}
              value={t('systems', { count: pulse.commissioned })}
            />
          </dl>
        </div>

        <div className="flex flex-col gap-3 border-on-panel/12 lg:col-span-3 lg:border-l lg:pl-8">
          <p className="type-overline text-on-panel-muted uppercase">{t('needsYou')}</p>
          <ul className="flex flex-col gap-2">
            {pulse.needsYou.map((item, index) => (
              <NeedsYouRow key={item.id} item={item} index={index} />
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

/** Eight weeks of collections as quiet bars; this week is lit in the logo gradient. */
function WeeklyBars({ values }: { readonly values: readonly number[] }) {
  const t = useTranslations('commandCenter');
  const max = Math.max(...values);
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  return (
    <figure className="flex flex-col gap-2 pt-2">
      <div
        role="img"
        aria-label={t('weeklyCollectionsAria', { first, last })}
        className="flex h-14 items-end gap-1.5"
      >
        {values.map((value, index) => (
          <motion.span
            key={index}
            className={cn(
              'flex-1 origin-bottom rounded-t-[3px]',
              index === values.length - 1 ? 'oh-brand-line' : 'bg-on-panel/20',
            )}
            style={{ height: `${(value / max) * 100}%` }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{
              duration: seconds('data'),
              ease: easing('outExpo'),
              delay: 0.25 + index * 0.04,
            }}
          />
        ))}
      </div>
      <figcaption className="type-label text-on-panel-muted">{t('weeklyCollections')}</figcaption>
    </figure>
  );
}

function PanelStat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="type-label text-on-panel-muted">{label}</dt>
      <dd className="font-mono text-[0.9375rem] text-on-panel tabular-nums">{value}</dd>
    </div>
  );
}

function NeedsYouRow({ item, index }: { readonly item: NeedsYouItem; readonly index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: seconds('slow'),
        ease: easing('outQuint'),
        delay: 0.3 + index * 0.08,
      }}
    >
      <button
        type="button"
        className={cn(
          'group flex w-full items-start gap-3 rounded-lg border border-on-panel/10 bg-on-panel/[0.06] p-3 text-left',
          'transition-colors duration-(--duration-fast) hover:border-on-panel/25 hover:bg-on-panel/[0.1]',
        )}
      >
        <StatusGlyph
          name={NEEDS_GLYPH[item.tone] ?? 'ready'}
          className="mt-0.5 size-4 text-on-panel"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="type-body-sm font-medium text-on-panel">{item.title}</span>
          <span className="type-label text-on-panel-muted">{item.detail}</span>
        </span>
        <ChevronRight
          aria-hidden
          className="mt-0.5 size-4 text-on-panel-muted transition-transform group-hover:translate-x-0.5"
        />
      </button>
    </motion.li>
  );
}
