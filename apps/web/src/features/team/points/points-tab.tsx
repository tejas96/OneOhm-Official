'use client';

import { Button } from '@oneohm/design-system/web';
import { HandHeart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useWorkforceSettings } from '@/features/settings/workforce/use-workforce-settings';
import { useCan } from '@/providers/current-user';
import { GivePointsDialog } from './give-points-dialog';
import { MonthlyReview } from './monthly-review';
import { PointsRules } from './points-rules';
import { PointsSuggestions } from './points-suggestions';
import { RecentPoints } from './recent-points';
import { StandingsTable } from './standings-table';
import { usePointsEntries, useStandings } from './use-points';

/** Who has earned what, suggestions waiting for a person, and recognition from a manager. */
export function PointsTab() {
  const t = useTranslations('team.points');
  const canManage = useCan('people.manage');
  const standings = useStandings();
  const entries = usePointsEntries();
  const settings = useWorkforceSettings(canManage);
  const [giving, setGiving] = useState(false);
  const policy = settings.data?.policy.points;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
        {canManage && (
          <Button
            variant="primary"
            leadingIcon={<HandHeart />}
            onClick={() => setGiving(true)}
            disabled={!policy}
            className="self-start sm:self-auto"
          >
            {t('giveAction')}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-10">
          {standings.isPending && <ListSkeleton label={t('loading')} rows={3} />}
          {standings.isError && (
            <LoadError error={standings.error} onRetry={() => standings.refetch()} />
          )}
          {standings.data && <StandingsTable standings={standings.data} />}
        </div>
        <aside aria-label={t('suggestions.title')} className="flex min-w-0 flex-col gap-5">
          {entries.isError && <LoadError error={entries.error} onRetry={() => entries.refetch()} />}
          {entries.data && <PointsSuggestions entries={entries.data} />}
          {policy && <PointsRules points={policy} />}
        </aside>
      </div>
      <MonthlyReview />
      {entries.data && <RecentPoints entries={entries.data} />}
      {policy && (
        <GivePointsDialog open={giving} onOpenChange={setGiving} max={policy.recognitionMax} />
      )}
    </div>
  );
}
