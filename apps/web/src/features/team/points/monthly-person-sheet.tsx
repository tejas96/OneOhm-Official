'use client';

import type { MonthlyRow } from '@oneohm/api-contracts';
import { cn, EmptyState, Sheet } from '@oneohm/design-system/web';
import { isMissedLine } from '@oneohm/domain';
import { ListChecks } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useMonthlyPerson } from './use-monthly';

/** One person's month, every point line by project, missed parts included. */
export function MonthlyPersonSheet({
  person,
  month,
  monthLabel,
  onClose,
}: {
  readonly person: MonthlyRow['user'] | null;
  readonly month: string;
  readonly monthLabel: string;
  readonly onClose: () => void;
}) {
  const t = useTranslations('team.points.monthly.person');
  const query = useMonthlyPerson(person?.id ?? null, month);
  return (
    <Sheet
      open={person !== null}
      onOpenChange={(open) => !open && onClose()}
      width="lg"
      title={person?.fullName ?? ''}
      description={t('description', { month: monthLabel })}
    >
      <div className="flex flex-col gap-6 px-5 py-5 sm:px-6">
        {query.isPending && <ListSkeleton label={t('loading')} rows={4} />}
        {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
        {query.data?.projects.length === 0 && (
          <EmptyState icon={<ListChecks />} title={t('empty')} />
        )}
        {query.data?.projects.map((project) => (
          <section key={project.projectId ?? 'none'} className="flex flex-col gap-2">
            <h3 className="flex items-baseline gap-2 border-b border-hairline pb-2">
              <span className="font-mono text-[0.75rem] text-ink-faint">{project.code}</span>
              <span className="type-title-md text-ink">{project.name}</span>
            </h3>
            <ul className="flex flex-col gap-1.5">
              {project.lines.map((line) => (
                <li key={line.id} className="flex items-start justify-between gap-4">
                  <span
                    className={cn(
                      'type-body-sm',
                      isMissedLine(line) ? 'text-ink-muted' : 'text-ink',
                    )}
                  >
                    {line.reason}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 font-mono text-[0.8125rem] tabular-nums',
                      isMissedLine(line) ? 'text-at-risk' : 'text-on-track',
                    )}
                  >
                    {isMissedLine(line) ? t('missed') : `+${line.points}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
