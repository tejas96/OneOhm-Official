'use client';

import {
  listItemEnter,
  StageTracker,
  StatusPill,
  type TrackerStage,
} from '@oneohm/design-system/web';
import { formatKwp } from '@oneohm/shared';
import { ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { type AttentionProject, EPC_STAGES } from '../../command-center/preview-data';
import { LAB_PROJECTS } from '../lab-data';

function stagesOf(project: AttentionProject, name: (stage: string) => string): TrackerStage[] {
  const current = EPC_STAGES.indexOf(project.currentStage);
  const waiting = project.waitingOn !== null && project.waitingOn !== 'internal';
  return EPC_STAGES.map((stage, index) => ({
    id: stage,
    name: name(stage),
    status: project.skippedStages.includes(stage)
      ? 'skipped'
      : index < current
        ? 'completed'
        : index > current
          ? 'pending'
          : waiting
            ? 'waiting'
            : 'active',
    progress: project.stageProgress,
  }));
}

/** Live projects as a row of soft cards that scrolls sideways on smaller screens. */
export function ProjectStrip() {
  const t = useTranslations('lab.bento');
  const stagesT = useTranslations('stages');
  return (
    <section aria-label={t('projects')} className="flex flex-col gap-4">
      <header className="flex items-end justify-between gap-4 px-1">
        <h2 className="type-display-md text-ink">{t('projects')}</h2>
        <a
          href="#strip"
          className="inline-flex items-center gap-1 type-body-sm font-medium text-accent hover:underline"
        >
          {t('allProjects')}
          <ArrowRight aria-hidden className="size-4" />
        </a>
      </header>
      <ul id="strip" className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2">
        {LAB_PROJECTS.map((project, index) => (
          <motion.li
            key={project.id}
            {...listItemEnter(index)}
            className="flex w-72 shrink-0 snap-start flex-col gap-4 rounded-[24px] bg-raised p-5 shadow-e1 ring-1 ring-hairline/70"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[0.75rem] text-ink-faint">{project.id}</span>
              <StatusPill tone={project.tone} label={project.toneLabel} size="sm" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="truncate type-title-lg font-normal text-ink [font-family:var(--font-display)]">
                {project.name}
              </p>
              <p className="truncate type-body-sm text-ink-faint">
                {formatKwp(project.capacityWp)} · {project.place}
              </p>
            </div>
            <StageTracker stages={stagesOf(project, (stage) => stagesT(stage))} />
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
