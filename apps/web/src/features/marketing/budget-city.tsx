'use client';

import { Button, cn, Field, Input } from '@oneohm/design-system/web';
import { budgetProblem, paidProviders } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { Draft } from './compose-checks';
import { budgetBreakdown, paiseFromRupeeText } from './marketing-words';

const QUICK_BUDGETS = [300, 500, 1000] as const;

/** City with quick chips, and the daily budget with quick picks and a plain monthly line. */
export function BudgetCity({
  draft,
  cities,
  showBudget,
  onCity,
  onBudget,
}: {
  readonly draft: Draft;
  readonly cities: readonly string[];
  readonly showBudget: boolean;
  readonly onCity: (city: string) => void;
  readonly onBudget: (rupees: string) => void;
}) {
  const t = useTranslations('marketing');
  const paise = paiseFromRupeeText(draft.budget);
  const problem =
    draft.budget === '' ? null : budgetProblem(paise, paidProviders(draft.goal, draft.channels));
  const line = budgetBreakdown(paise, draft.goal, draft.channels);
  return (
    <div className="flex flex-col gap-5">
      <Field label={t('city.label')}>
        <Input
          value={draft.city}
          onChange={(event) => onCity(event.target.value)}
          placeholder={t('city.placeholder')}
          autoComplete="off"
        />
        {cities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {cities.slice(0, 6).map((city) => (
              <Chip key={city} on={draft.city === city} onClick={() => onCity(city)}>
                {city}
              </Chip>
            ))}
          </div>
        )}
      </Field>
      {showBudget && (
        <Field label={t('budget.label')} error={problem}>
          <Input
            inputMode="numeric"
            value={draft.budget}
            onChange={(event) => onBudget(event.target.value.replace(/[^\d]/g, ''))}
            leading="₹"
            trailing={<span className="pr-1 type-body-sm">{t('budget.perDay')}</span>}
            className="tabular-nums"
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {QUICK_BUDGETS.map((rupees) => (
              <Chip
                key={rupees}
                on={paise === rupees * 100}
                onClick={() => onBudget(String(rupees))}
              >
                {formatInr(rupees * 100)}
              </Chip>
            ))}
          </div>
          {line && !problem && (
            <p className="pt-1 type-body-sm text-ink-muted">
              {t('budget.line', {
                monthly: formatInr(line.monthlyPaise),
                split: line.parts
                  .map((part) =>
                    t('budget.part', {
                      amount: formatInr(part.paise),
                      place: t(`provider.${part.provider}`),
                    }),
                  )
                  .join(', '),
              })}
            </p>
          )}
        </Field>
      )}
    </div>
  );
}

/** A small round-cornered choice used for cities and budgets. */
export function Chip({
  on,
  onClick,
  children,
}: {
  readonly on: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant={on ? 'primary' : 'secondary'}
      aria-pressed={on}
      className={cn('rounded-full')}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
