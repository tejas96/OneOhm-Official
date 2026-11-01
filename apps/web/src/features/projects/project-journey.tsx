'use client';

import type { ProjectSummary } from '@oneohm/api-contracts';
import { cn, easing, listItemEnter, StatusPill, seconds } from '@oneohm/design-system/web';
import { EPC_STAGES } from '@oneohm/domain';
import { formatKwp } from '@oneohm/shared';
import { Hourglass } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { ForecastNote } from './forecast-note';

/** Project · journey · status, shared by the command centre and the projects list. */
export const PROJECT_COLUMNS =
  'grid gap-4 md:grid-cols-[minmax(0,1.25fr)_minmax(0,2.2fr)_minmax(0,1fr)] md:items-center';
const STEP = 100 / EPC_STAGES.length;
const centre = (index: number) => STEP * index + STEP / 2;

/** Column labels above a list of project rows (wide screens only). */
export function ProjectColumnsHeader({
  project,
  statusNext,
}: {
  readonly project: string;
  readonly statusNext: string;
}) {
  const shortT = useTranslations('stagesShort');
  return (
    <div
      className={cn(PROJECT_COLUMNS, 'hidden border-b border-hairline pb-3 md:grid')}
      aria-hidden
    >
      <span className="type-overline text-ink-faint uppercase">{project}</span>
      <span className="grid grid-cols-7">
        {EPC_STAGES.map((stage) => (
          <span
            key={stage}
            className="px-0.5 text-center text-[0.6875rem] leading-tight text-ink-faint"
          >
            {shortT(stage)}
          </span>
        ))}
      </span>
      <span className="type-overline text-ink-faint uppercase">{statusNext}</span>
    </div>
  );
}

/** One project as a row: who and where, the journey as a metro line, then status and next. */
export function ProjectRow({
  project,
  index,
}: {
  readonly project: ProjectSummary;
  readonly index: number;
}) {
  return (
    <motion.li
      {...listItemEnter(index)}
      className={cn(
        PROJECT_COLUMNS,
        'relative rounded-lg py-4 transition-colors hover:bg-surface/60',
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-mono text-[0.75rem] text-ink-faint">
          {project.code} · {formatKwp(project.capacityWp)}
        </p>
        <Link
          href={`/projects/${project.id}`}
          className="truncate type-title-lg font-normal text-ink [font-family:var(--font-display)] after:absolute after:inset-0 hover:text-accent"
        >
          {project.name}
        </Link>
        <p className="truncate type-body-sm text-ink-faint">{project.place}</p>
      </div>
      <MetroLine project={project} index={index} />
      <ProjectStatus project={project} />
    </motion.li>
  );
}

export function MetroLine({
  project,
  index,
}: {
  readonly project: ProjectSummary;
  readonly index: number;
}) {
  const stagesT = useTranslations('stages');
  const current = EPC_STAGES.indexOf(project.currentStage);
  const waiting = project.waitingOn !== null && project.waitingOn !== 'internal';
  return (
    <div
      role="img"
      aria-label={stagesT(project.currentStage)}
      className="relative grid h-10 grid-cols-7 items-center"
    >
      <span
        className="absolute top-1/2 h-px -translate-y-1/2 border-t border-dashed border-rule"
        style={{ left: `${centre(0)}%`, right: `${STEP / 2}%` }}
      />
      <motion.span
        className="absolute top-1/2 h-[3px] origin-left -translate-y-1/2 rounded-full bg-ink"
        style={{ left: `${centre(0)}%`, width: `${centre(current) - centre(0)}%` }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{
          duration: seconds('data'),
          ease: easing('outExpo'),
          delay: 0.15 + index * 0.05,
        }}
      />
      {EPC_STAGES.map((stage, stageIndex) => {
        const skipped = project.skippedStages.includes(stage);
        const done = stageIndex < current;
        const isCurrent = stageIndex === current;
        return (
          <span key={stage} className="relative z-10 flex justify-center">
            {isCurrent ? (
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full ring-4 ring-canvas',
                  waiting ? 'bg-waiting-solid' : 'bg-accent',
                )}
              >
                {waiting ? (
                  <Hourglass aria-hidden className="size-3 text-on-accent" />
                ) : (
                  <span className="size-2 animate-pulse rounded-full bg-on-accent" />
                )}
              </span>
            ) : (
              <span
                className={cn(
                  'size-2.5 rounded-full ring-4 ring-canvas',
                  done && 'bg-ink',
                  !done && !skipped && 'border border-rule bg-canvas',
                  skipped && 'oh-hatch border border-dashed border-rule bg-surface',
                )}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

export function ProjectStatus({ project }: { readonly project: ProjectSummary }) {
  const format = useFormatter();
  return (
    <div className="flex flex-col items-start gap-1.5">
      <StatusPill tone={project.tone} label={project.toneLabel} size="sm" />
      {project.blockedBy && <p className="type-body-sm text-blocked">{project.blockedBy}</p>}
      {project.next && (
        <p className="type-body-sm text-ink-muted">
          {project.next.label} ·{' '}
          <time dateTime={project.next.date} className="text-ink">
            {format.dateTime(new Date(project.next.date), { day: 'numeric', month: 'short' })}
          </time>
        </p>
      )}
      <ForecastNote forecast={project.forecast} />
    </div>
  );
}
