'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { ArrowRight, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { blockingOf } from '../tasks/task-status';

/** Stable keys for lines that may repeat (two tasks can share a title). */
const keyed = (lines: readonly string[]) => {
  const seen = new Map<string, number>();
  return lines.map((text) => {
    const count = (seen.get(text) ?? 0) + 1;
    seen.set(text, count);
    return { key: `${text}#${count}`, text };
  });
};

/** A titled block in the task panel. */
export function PanelSection({
  title,
  action,
  children,
}: {
  readonly title: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2 border-b border-hairline pb-2">
        <h3 className="type-overline text-ink-faint uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** What this task waits for, and what waits for it (spec 3.4). */
export function BlockersSection({ task }: { readonly task: ProjectTask }) {
  const t = useTranslations('projects.panel');
  const partyT = useTranslations('projects.panel.party');
  const details = task.blockers ?? [];
  // Change requests and budget holds have no task behind them: titles only.
  const others = (task.status === 'completed' ? [] : task.blockedBy).filter(
    (title) => !details.some((blocker) => blocker.title === title),
  );
  const waiting = [
    ...details.map((blocker) => ({
      key: blocker.title,
      text: blocker.waitingOn
        ? t('blockerOutside', {
            title: blocker.title,
            party: partyT(blocker.waitingOn),
            days: blocker.daysLate,
          })
        : t('blocker', {
            title: blocker.title,
            who: blocker.assignee ?? t('nobody'),
            days: blocker.daysLate,
          }),
    })),
    ...others.map((title) => ({ key: title, text: title })),
  ];
  const blocking = blockingOf(task);
  return (
    <>
      {waiting.length > 0 && (
        <PanelSection title={t('waitingFor')}>
          <ul className="flex flex-col gap-1.5">
            {waiting.map((line, index) => (
              <li
                key={`${index}-${line.key}`}
                className="flex items-start gap-2 type-body text-ink"
              >
                <Lock aria-hidden className="mt-1 size-3.5 shrink-0 text-ink-faint" />
                {line.text}
              </li>
            ))}
          </ul>
        </PanelSection>
      )}
      {blocking.length > 0 && (
        <PanelSection title={t('blocking', { count: blocking.length })}>
          <ul className="flex flex-col gap-1.5">
            {keyed(blocking).map((line) => (
              <li key={line.key} className="flex items-start gap-2 type-body text-ink">
                <ArrowRight aria-hidden className="mt-1 size-3.5 shrink-0 text-ink-faint" />
                {line.text}
              </li>
            ))}
          </ul>
        </PanelSection>
      )}
    </>
  );
}

/** Facts the task records, with what the project already knows. */
export function FactsSection({ task }: { readonly task: ProjectTask }) {
  const t = useTranslations('projects.panel');
  if (task.captureFields.length === 0) return null;
  return (
    <PanelSection title={t('facts')}>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {task.captureFields.map((field) => {
          const value = task.knownFacts[field.key];
          return (
            <div key={field.key} className="flex min-w-0 flex-col">
              <dt className="type-label text-ink-faint">{field.label}</dt>
              <dd
                className={cn(
                  'type-body [overflow-wrap:anywhere]',
                  value ? 'text-ink' : 'text-ink-faint',
                )}
              >
                {value || t('notRecorded')}
              </dd>
            </div>
          );
        })}
      </dl>
    </PanelSection>
  );
}
