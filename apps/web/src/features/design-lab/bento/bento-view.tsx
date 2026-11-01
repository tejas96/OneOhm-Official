'use client';

import { Badge, Button, pageEnter } from '@oneohm/design-system/web';
import { CalendarDays, FlaskConical, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { ActionList } from '../action-list';
import { useGreeting } from '../use-greeting';
import { CollectionsTile, HealthTile, InstalledTile, WaitingTile } from './bento-tiles';
import { PipelineTile } from './pipeline-tile';
import { ProjectStrip } from './project-strip';

/** Alternative C: soft bento tiles around a drawing of what the business builds. */
export function BentoView() {
  const t = useTranslations('lab.bento');
  const format = useFormatter();
  const now = useNow();
  const greeting = useGreeting();
  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-3 type-body-sm text-ink-muted">
            {format.dateTime(now, { weekday: 'long', day: 'numeric', month: 'long' })}
            <Badge variant="accent">
              <FlaskConical aria-hidden className="size-3.5" />
              {t('previewBadge')}
            </Badge>
          </p>
          <h1 className="type-display-lg text-ink">{greeting}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button leadingIcon={<CalendarDays />}>{t('period')}</Button>
          <Button variant="primary" leadingIcon={<Plus />}>
            {t('newQuotation')}
          </Button>
        </div>
      </header>
      <div className="grid gap-4 lg:grid-cols-12">
        <InstalledTile className="lg:col-span-7 lg:row-span-2" />
        <CollectionsTile className="lg:col-span-5" />
        <ActionList
          compact
          limit={3}
          className="rounded-[28px] border-0 shadow-e1 ring-1 ring-hairline/70 lg:col-span-5"
        />
        <HealthTile className="lg:col-span-4" />
        <WaitingTile className="lg:col-span-4" />
        <PipelineTile className="lg:col-span-4" />
      </div>
      <ProjectStrip />
    </motion.div>
  );
}
