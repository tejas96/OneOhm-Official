'use client';

import {
  Badge,
  CardHeader,
  listItemEnter,
  StageTracker,
  StatusPill,
  type TrackerStage,
} from '@oneohm/design-system/web';
import { formatKwp } from '@oneohm/shared';
import { ArrowRight, CalendarDays, Hourglass } from 'lucide-react';
import { motion } from 'motion/react';
import { useFormatter, useTranslations } from 'next-intl';
import { type AttentionProject, EPC_STAGES, PREVIEW } from './preview-data';

const PARTY_DOT = {
  internal: 'bg-party-internal',
  customer: 'bg-party-customer',
  bank: 'bg-party-bank',
  discom: 'bg-party-discom',
} as const;

/** Projects that need a decision, in the order the owner should look at them. */
export function AttentionProjects() {
  const t = useTranslations('commandCenter.attention');
  return (
    <section id="projects" aria-labelledby="attention-title" className="flex flex-col gap-1">
      <CardHeader
        id="attention-title"
        title={t('title')}
        description={t('description')}
        className="px-0"
        action={
          <a
            href="#projects"
            className="inline-flex items-center gap-1 type-body-sm font-medium text-accent hover:underline"
          >
            {t('viewAll')}
            <ArrowRight aria-hidden className="size-4" />
          </a>
        }
      />
      <ul className="grid gap-3 lg:grid-cols-3">
        {PREVIEW.projects.map((project, index) => (
          <motion.li key={project.id} {...listItemEnter(index)}>
            <ProjectCard project={project} />
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

function ProjectCard({ project }: { readonly project: AttentionProject }) {
  const t = useTranslations('commandCenter.attention');
  const stagesT = useTranslations('stages');
  const format = useFormatter();
  const currentIndex = EPC_STAGES.indexOf(project.currentStage);
  const stages: TrackerStage[] = EPC_STAGES.map((stage, index) => ({
    id: stage,
    name: stagesT(stage),
    status: project.skippedStages.includes(stage)
      ? 'skipped'
      : index < currentIndex
        ? 'completed'
        : index > currentIndex
          ? 'pending'
          : project.waitingOn && project.waitingOn !== 'internal'
            ? 'waiting'
            : 'active',
    progress: project.stageProgress,
  }));
  return (
    <article className="group relative flex h-full flex-col gap-4 rounded-xl border border-hairline bg-raised p-5 transition-[box-shadow,transform] duration-(--duration-base) hover:-translate-y-0.5 hover:shadow-e2">
      <header className="flex flex-col gap-2">
        <p className="flex items-center justify-between gap-3">
          <span className="font-mono text-[0.75rem] text-ink-faint">{project.id}</span>
          <StatusPill tone={project.tone} label={project.toneLabel} size="sm" />
        </p>
        <h3 className="type-display-md text-balance text-ink">
          <a href="#projects" className="oh-stretched-link outline-offset-4">
            {project.name}
          </a>
        </h3>
        <p className="flex flex-wrap items-center gap-2 type-body-sm text-ink-faint">
          <Badge variant="soft">
            {t(`kind.${project.kind}`)} · {formatKwp(project.capacityWp)}
          </Badge>
          {project.place} · {project.discom}
        </p>
      </header>
      <p className="type-body-sm text-ink-muted">{project.sentence}</p>
      <StageTracker stages={stages} />
      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3 type-body-sm">
        <span className="inline-flex items-center gap-1.5 text-ink-muted">
          <CalendarDays aria-hidden className="size-4 text-ink-faint" />
          {project.next.label} ·{' '}
          <time dateTime={project.next.date} className="font-medium text-ink">
            {format.dateTime(new Date(project.next.date), { day: 'numeric', month: 'short' })}
          </time>
        </span>
        {project.waitingOn && (
          <span className="inline-flex items-center gap-1.5 text-ink-muted">
            <span aria-hidden className={`size-2 rounded-full ${PARTY_DOT[project.waitingOn]}`} />
            <Hourglass aria-hidden className="size-3.5 text-ink-faint" />
            {t('waitingOn', { party: t(`party.${project.waitingOn}`), days: project.waitingDays })}
          </span>
        )}
      </footer>
    </article>
  );
}
