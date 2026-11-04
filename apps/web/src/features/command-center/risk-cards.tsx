'use client';

import type { RiskItem } from '@oneohm/api-contracts';
import { type PillTone, StatusPill } from '@oneohm/design-system/web';
import { ArrowRight, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { hrefWithTask } from '@/features/projects/task-panel/task-panel-url';

const TONE: Readonly<Record<RiskItem['kind'], PillTone>> = {
  overdue: 'overdue',
  waiting: 'waiting',
  unassigned: 'atRisk',
};

/** What could slip on live projects, most pressing first, each with its next action. */
export function RiskCards({ risks }: { readonly risks: readonly RiskItem[] }) {
  const t = useTranslations('commandCenter.risks');
  return (
    <section aria-labelledby="risks-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="risks-title" className="type-title-md text-ink">
          {t('title')}
        </h2>
        {risks.length > 0 && (
          <p className="type-body-sm text-ink-faint">{t('count', { count: risks.length })}</p>
        )}
      </div>
      {risks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline px-5 py-6 type-body-sm text-ink-muted">
          {t('empty')}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {risks.map((risk) => (
            <RiskCard key={risk.taskId} risk={risk} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RiskCard({ risk }: { readonly risk: RiskItem }) {
  const t = useTranslations('commandCenter.risks');
  const partyT = useTranslations('commandCenter.party');
  const format = useFormatter();
  const date = format.dateTime(new Date(risk.dueDate), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const action =
    risk.kind === 'waiting'
      ? t(`action.waiting_${risk.party}`, { task: risk.taskTitle })
      : t(`action.${risk.kind}`, { task: risk.taskTitle });
  return (
    <li className="flex flex-col gap-4 rounded-xl border border-hairline bg-raised p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="type-label uppercase tracking-[0.08em] text-ink-faint">
          {risk.kind === 'waiting'
            ? `${t('kind.waiting')} · ${partyT(risk.party)}`
            : t(`kind.${risk.kind}`)}
        </span>
        <StatusPill size="sm" tone={TONE[risk.kind]} label={t(`pill.${risk.kind}`)} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="type-title-md text-ink">
          {risk.taskTitle}
          <span className="font-normal text-ink-muted">
            {' · '}
            {t('due', {
              date: format.dateTime(new Date(risk.dueDate), { day: 'numeric', month: 'short' }),
            })}
          </span>
        </p>
        <Link
          href={`/projects/${risk.projectId}`}
          className="font-mono text-[0.75rem] text-ink-faint hover:text-accent"
        >
          {risk.projectCode} · {risk.projectName}
        </Link>
      </div>
      <p className="type-body-sm text-ink-muted">
        {t(`story.${risk.kind}`, {
          date,
          days: risk.days,
          party: partyT(risk.party).toLowerCase(),
        })}
      </p>
      <Link
        href={hrefWithTask(`/projects/${risk.projectId}?tab=tasks`, risk.taskId)}
        className="group flex items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 hover:border-accent/60"
      >
        <span className="flex flex-col">
          <span className="type-label text-accent">{t('next')}</span>
          <span className="type-body-sm text-ink">{action}</span>
        </span>
        <ArrowRight
          aria-hidden
          className="size-4 shrink-0 text-accent transition-transform group-hover:translate-x-0.5"
        />
      </Link>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-t border-hairline pt-3 type-body-sm">
        <dt className="inline-flex items-center gap-1.5 text-ink-faint">
          <UserRound aria-hidden className="size-4" />
          {t('owner')}
        </dt>
        <dd className="truncate text-ink">{risk.owner ?? t('nobody')}</dd>
        {risk.managerName && (
          <>
            <dt className="pl-[1.375rem] text-ink-faint">{t('manager')}</dt>
            <dd className="truncate text-ink">{risk.managerName}</dd>
          </>
        )}
      </dl>
    </li>
  );
}
