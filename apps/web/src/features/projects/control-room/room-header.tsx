'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { Badge, StageTracker, StatusPill, type TrackerStage } from '@oneohm/design-system/web';
import { EPC_STAGES } from '@oneohm/domain';
import { formatInr, formatKwp } from '@oneohm/shared';
import { ArrowLeft, Phone } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ProjectChangeRequestButton } from '@/features/discom/project-change-request-button';

function stagesOf(project: ProjectDetail, name: (stage: string) => string): TrackerStage[] {
  const waiting = project.waitingOn !== null && project.waitingOn !== 'internal';
  return EPC_STAGES.map((stage) => {
    const tasks = project.tasks.filter((task) => task.stage === stage);
    const finished = tasks.length > 0 && tasks.every((task) => task.status === 'completed');
    let status: TrackerStage['status'] = 'pending';
    if (project.skippedStages.includes(stage) || tasks.length === 0) status = 'skipped';
    else if (stage === project.currentStage && project.status === 'active')
      status = waiting ? 'waiting' : 'active';
    else if (finished) status = 'completed';
    const done = tasks.filter((task) => task.status === 'completed').length;
    return {
      id: stage,
      name: name(stage),
      status,
      progress: tasks.length ? done / tasks.length : 0,
    };
  });
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="type-overline text-ink-faint uppercase">{label}</dt>
      <dd className="truncate type-body text-ink">{children}</dd>
    </div>
  );
}

/** Who, where and how big; the journey; and the facts people ask about most. */
export function RoomHeader({ project }: { readonly project: ProjectDetail }) {
  const t = useTranslations('projects.room');
  const typeT = useTranslations('projects.list.type');
  const stagesT = useTranslations('stages');
  const format = useFormatter();
  const options = (['loan', 'battery', 'groundMount', 'subsidy'] as const).filter(
    (key) => project[key],
  );

  return (
    <header className="flex flex-col gap-7">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 self-start type-body-sm text-ink-muted hover:text-accent"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t('back')}
      </Link>
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-mono text-[0.75rem] tracking-wide text-ink-faint uppercase">
            {project.code} · {typeT(project.type)}
          </p>
          <h1 className="type-display-lg text-balance text-ink md:type-display-xl">
            {project.name}
          </h1>
          <p className="type-body text-ink-muted">
            {formatKwp(project.capacityWp)} · {project.discom} · {project.address}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <StatusPill tone={project.tone} label={project.toneLabel} />
          <ProjectChangeRequestButton projectId={project.id} />
          {project.next && (
            <p className="type-body-sm text-ink-muted">
              {t('next', { label: project.next.label })} ·{' '}
              <time dateTime={project.next.date} className="text-ink">
                {format.dateTime(new Date(project.next.date), { day: 'numeric', month: 'short' })}
              </time>
            </p>
          )}
        </div>
      </div>
      <StageTracker stages={stagesOf(project, stagesT)} variant="full" />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-2xl bg-raised p-5 shadow-e1 ring-1 ring-hairline/70 sm:grid-cols-3 xl:grid-cols-6">
        <Fact label={t('facts.customer')}>
          <span className="flex flex-col">
            {project.customer.name}
            <a
              href={`tel:${project.customer.phone}`}
              className="inline-flex items-center gap-1 type-body-sm text-accent hover:underline"
            >
              <Phone aria-hidden className="size-3.5" />
              {project.customer.phone}
            </a>
          </span>
        </Fact>
        <Fact label={t('facts.manager')}>{project.manager?.fullName ?? t('facts.noManager')}</Fact>
        <Fact label={t('facts.value')}>
          <span className="tabular-nums">{formatInr(project.quotation.totalPaise)}</span>
        </Fact>
        <Fact label={t('facts.subsidy')}>
          <span className="tabular-nums">{formatInr(project.quotation.subsidyPaise)}</span>
        </Fact>
        <Fact label={t('facts.effective')}>
          <span className="tabular-nums">{formatInr(project.quotation.effectivePaise)}</span>
        </Fact>
        <Fact label={t('facts.started')}>
          {format.dateTime(new Date(project.startDate), {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </Fact>
        <div className="col-span-full flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
          <span className="type-body-sm text-ink-faint">
            {t('facts.quotation', { number: project.quotation.number })}
          </span>
          {options.map((key) => (
            <Badge key={key} variant="soft">
              {key === 'loan' && project.lenderName
                ? t('options.loanWith', { lender: project.lenderName })
                : t(`options.${key}`)}
            </Badge>
          ))}
        </div>
      </dl>
    </header>
  );
}
