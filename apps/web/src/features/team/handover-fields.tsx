'use client';

import type { Person } from '@oneohm/api-contracts';
import { Checkbox, Field, Input, Select } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';

export interface HandoverDraft {
  readonly targetId: string | undefined;
  readonly lastWorkingDay: string;
  readonly tellCustomers: boolean;
}

/** The three choices of a removal: who takes the work, the last day, and telling customers. */
export function HandoverFields({
  draft,
  onChange,
  candidates,
  today,
  errors,
}: {
  readonly draft: HandoverDraft;
  readonly onChange: (draft: HandoverDraft) => void;
  readonly candidates: readonly Person[];
  readonly today: string;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('team.remove');
  const tTeam = useTranslations('team');
  const options = candidates.map((person) => ({
    value: person.id,
    label: person.fullName,
    description: [person.designation, tTeam('openTasks', { count: person.openTasks })]
      .filter(Boolean)
      .join(' · '),
  }));
  const lateDate = draft.lastWorkingDay > today;

  return (
    <div className="flex flex-col gap-5">
      {candidates.length === 0 ? (
        <p className="rounded-md bg-sunken/70 px-3 py-2.5 type-body-sm text-ink-muted">
          {t('noOneToHandTo')}
        </p>
      ) : (
        <Field label={t('handTo')} hint={t('handToHint')} required error={errors.handToUserId}>
          <Select
            value={draft.targetId}
            onValueChange={(targetId) => onChange({ ...draft, targetId })}
            options={options}
            placeholder={t('handToPlaceholder')}
          />
        </Field>
      )}
      <Field
        label={t('lastDay')}
        hint={t('lastDayHint')}
        required
        error={errors.lastWorkingDay ?? (lateDate ? t('lastDayHint') : undefined)}
        className="max-w-xs"
      >
        <Input
          type="date"
          value={draft.lastWorkingDay}
          max={today}
          onChange={(event) => onChange({ ...draft, lastWorkingDay: event.target.value })}
        />
      </Field>
      <Checkbox
        checked={draft.tellCustomers}
        onCheckedChange={(tellCustomers) => onChange({ ...draft, tellCustomers })}
        label={t('tellCustomers')}
        description={t('tellCustomersHint')}
      />
    </div>
  );
}
