'use client';

import type { SubsidyRuleVersion } from '@oneohm/api-contracts';
import { Badge, Button } from '@oneohm/design-system/web';
import { ChevronRight, ListChecks, Pencil, Undo2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { SubsidyRuleLines } from './subsidy-rule-lines';

export interface RuleActions {
  readonly canManage: boolean;
  readonly onEdit: (rule: SubsidyRuleVersion) => void;
  readonly onWithdraw: (rule: SubsidyRuleVersion) => void;
  readonly onCheck: (asOf: string) => void;
}

function useDay() {
  const format = useFormatter();
  return (date: string) => format.dateTime(new Date(date), { dateStyle: 'medium' });
}

/** A version that starts later: still open to change, withdrawal and an impact check. */
function ScheduledVersion({
  rule,
  actions,
}: {
  readonly rule: SubsidyRuleVersion;
  readonly actions: RuleActions;
}) {
  const t = useTranslations('settings.subsidy');
  const day = useDay();
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-rule bg-sunken/50 p-4">
      <Badge variant="accent" className="self-start">
        {t('startsOn', { date: day(rule.validFrom) })}
      </Badge>
      <SubsidyRuleLines rule={rule} />
      <div className="-ml-2 flex flex-wrap gap-1">
        <Button
          variant="quiet"
          size="sm"
          leadingIcon={<ListChecks />}
          onClick={() => actions.onCheck(rule.validFrom)}
        >
          {t('affected')}
        </Button>
        {actions.canManage && (
          <>
            <Button
              variant="quiet"
              size="sm"
              leadingIcon={<Pencil />}
              onClick={() => actions.onEdit(rule)}
            >
              {t('edit')}
            </Button>
            <Button
              variant="quiet"
              size="sm"
              leadingIcon={<Undo2 />}
              onClick={() => actions.onWithdraw(rule)}
            >
              {t('withdraw')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** One category: the version in force, any that start later, and the history under a fold. */
export function SubsidyRuleCard({
  category,
  versions,
  actions,
}: {
  readonly category: SubsidyRuleVersion['category'];
  readonly versions: readonly SubsidyRuleVersion[];
  readonly actions: RuleActions;
}) {
  const t = useTranslations('settings.subsidy');
  const day = useDay();
  const current = versions.find((rule) => rule.state === 'in_force');
  const scheduled = versions
    .filter((rule) => rule.state === 'scheduled')
    .sort((left, right) => left.validFrom.localeCompare(right.validFrom));
  const earlier = versions.filter((rule) => rule.state === 'earlier');

  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl bg-raised p-5 shadow-e1 ring-1 ring-hairline/70">
      <header className="flex flex-col gap-1">
        <h3 className="type-title-lg font-normal text-ink [font-family:var(--font-display)]">
          {t(`categories.${category}`)}
        </h3>
        <p className="font-mono text-[0.75rem] text-ink-faint">
          {current ? t('inForceSince', { date: day(current.validFrom) }) : t('noneInForce')}
        </p>
      </header>
      {current && <SubsidyRuleLines rule={current} />}
      {scheduled.map((rule) => (
        <ScheduledVersion key={rule.id} rule={rule} actions={actions} />
      ))}
      {earlier.length > 0 && (
        <details className="group mt-auto border-t border-hairline pt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1 type-body-sm text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden
              className="size-4 transition-transform group-open:rotate-90"
            />
            {t('earlier', { count: earlier.length })}
          </summary>
          <ul className="mt-3 flex flex-col gap-4">
            {earlier.map((rule) => (
              <li key={rule.id} className="flex flex-col gap-2">
                <p className="font-mono text-[0.75rem] text-ink-faint">
                  {t('validFrom', { date: day(rule.validFrom) })}
                </p>
                <SubsidyRuleLines rule={rule} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
