'use client';

import { Field, Input, Select } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';

export type TrackingChoice = 'follow' | 'on' | 'off';

export interface WorkDraft {
  /** Digits as typed; empty means the company default. */
  readonly limit: string;
  readonly tracking: TrackingChoice;
}

export const workDraftFrom = (person: {
  readonly personalTaskLimit: number | null;
  readonly tracking: 'on' | 'off' | null;
}): WorkDraft => ({
  limit: person.personalTaskLimit === null ? '' : String(person.personalTaskLimit),
  tracking: person.tracking ?? 'follow',
});

/** The update body: an own limit or back to the default, and the location override. */
export function workBodyFrom(draft: WorkDraft) {
  const limit = Number.parseInt(draft.limit, 10);
  return {
    openTaskLimit: draft.limit.trim() === '' || Number.isNaN(limit) ? null : limit,
    tracking: draft.tracking === 'follow' ? null : draft.tracking,
  };
}

/**
 * One person's workload limit (PRD 3.12) and whether location is asked for at their
 * check-ins (PRD 4.3), over their roles and the company setting.
 */
export function PersonWorkFields({
  draft,
  onChange,
  companyLimit,
  errors,
}: {
  readonly draft: WorkDraft;
  readonly onChange: (next: WorkDraft) => void;
  readonly companyLimit: number | null;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('team.editSheet.work');
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field
        label={t('limit')}
        hint={companyLimit ? t('limitHint', { count: companyLimit }) : t('limitHintNone')}
        error={errors.openTaskLimit}
      >
        <Input
          inputMode="numeric"
          value={draft.limit}
          placeholder={companyLimit ? String(companyLimit) : t('noLimit')}
          onChange={(event) =>
            onChange({ ...draft, limit: event.target.value.replace(/[^0-9]/g, '').slice(0, 3) })
          }
        />
      </Field>
      <Field label={t('tracking')} hint={t('trackingHint')} error={errors.tracking}>
        <Select
          value={draft.tracking}
          onValueChange={(tracking) => onChange({ ...draft, tracking })}
          options={[
            { value: 'follow', label: t('follow') },
            { value: 'on', label: t('on') },
            { value: 'off', label: t('off') },
          ]}
        />
      </Field>
    </div>
  );
}
