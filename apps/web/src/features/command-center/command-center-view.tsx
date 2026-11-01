'use client';

import { Badge, Button, PageHeader, pageEnter } from '@oneohm/design-system/web';
import { CalendarDays, FlaskConical, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { AttentionProjects } from './attention-projects';
import { MoneyCard, PipelineCard, WaitingCard } from './insight-cards';
import { KpiRow } from './kpi-row';
import { PulsePanel } from './pulse-panel';

/** The owner's morning view of the whole business. */
export function CommandCenterView() {
  const t = useTranslations('commandCenter');
  const format = useFormatter();
  const now = useNow();
  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-3">
            {format.dateTime(now, { weekday: 'long', day: 'numeric', month: 'long' })}
            <Badge variant="accent">
              <FlaskConical aria-hidden className="size-3.5" />
              {t('previewBadge')}
            </Badge>
          </span>
        }
        title={t('title')}
        description={t('description')}
        actions={
          <>
            <Button leadingIcon={<CalendarDays />}>{t('period')}</Button>
            <Button variant="primary" leadingIcon={<Plus />}>
              {t('newQuotation')}
            </Button>
          </>
        }
      />
      <PulsePanel />
      <KpiRow />
      <AttentionProjects />
      <section aria-label={t('insightsLabel')} className="grid gap-3 lg:grid-cols-3">
        <WaitingCard />
        <MoneyCard />
        <PipelineCard />
      </section>
    </motion.div>
  );
}
