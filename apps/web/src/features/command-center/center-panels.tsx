'use client';

import type { CommandCenter } from '@oneohm/api-contracts';
import { Card, CardHeader } from '@oneohm/design-system/web';
import { ChevronRight, Eye } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { hrefWithTask } from '@/features/projects/task-panel/task-panel-url';

/** Decisions waiting on someone at OneOhm, each a count and a way in. */
export function DecisionsWaiting({
  decisions,
}: {
  readonly decisions: CommandCenter['decisions'];
}) {
  const t = useTranslations('commandCenter.decisions');
  return (
    <Card className="flex flex-col">
      <CardHeader title={t('title')} />
      {decisions.length === 0 ? (
        <p className="px-5 pb-5 type-body-sm text-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col pb-2">
          {decisions.map((decision) => (
            <li key={decision.key}>
              <Link
                href={decision.href}
                className="flex items-center gap-4 px-5 py-3 hover:bg-sunken/60"
              >
                <span className="w-6 font-serif text-[1.375rem] leading-none text-ink tabular-nums">
                  {decision.count}
                </span>
                <span className="flex-1 type-body-sm text-ink">{t(`items.${decision.key}`)}</span>
                <ChevronRight aria-hidden className="size-4 text-ink-faint" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Open tasks falling due within the Settings "coming up" days on the projects in view. */
export function DeadlinesAhead({
  deadlines,
  today,
  days,
}: {
  readonly deadlines: CommandCenter['deadlines'];
  readonly today: string;
  readonly days: number;
}) {
  const t = useTranslations('commandCenter.deadlines');
  const format = useFormatter();
  const short = (date: string) =>
    format.dateTime(new Date(date), { day: 'numeric', month: 'short' });
  const end = new Date(new Date(today).getTime() + days * 86_400_000).toISOString().slice(0, 10);
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="flex flex-col gap-0.5">
          <h2 className="type-title-md text-ink">{t('title', { days })}</h2>
          <p className="type-body-sm text-ink-muted">
            {t('range', { start: short(today), end: short(end) })}
          </p>
        </div>
        <span className="font-serif text-[2rem] leading-none text-ink tabular-nums">
          {deadlines.length}
        </span>
      </div>
      {deadlines.length === 0 ? (
        <p className="px-5 py-5 type-body-sm text-ink-muted">{t('empty', { days })}</p>
      ) : (
        <ul className="flex flex-col py-2">
          {deadlines.map((deadline) => (
            <li key={deadline.taskId}>
              <Link
                href={hrefWithTask(`/projects/${deadline.projectId}?tab=tasks`, deadline.taskId)}
                className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 px-5 py-2.5 hover:bg-sunken/60"
              >
                <span className="pt-0.5 font-mono text-[0.75rem] text-ink-muted">
                  {short(deadline.dueDate)}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="type-body-sm text-ink">{deadline.title}</span>
                  <span className="flex flex-wrap items-center gap-x-2 type-label text-ink-faint">
                    <span className="font-mono">{deadline.projectCode}</span>
                    <span>{deadline.assignee ?? t('unassigned')}</span>
                    {deadline.customerVisible && (
                      <span className="inline-flex items-center gap-1">
                        <Eye aria-hidden className="size-3" />
                        {t('customer')}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
