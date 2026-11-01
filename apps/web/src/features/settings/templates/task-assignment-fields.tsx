'use client';

import { Field, Switch } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { NumberInput } from '../number-input';
import type { SetDraft, TaskDraft } from './task-draft';

/** Critical work waits for a manager to confirm the person; its own escalation days (PRD 3.7, 3.8). */
export function TaskAssignmentFields({
  draft,
  set,
  errors,
}: {
  readonly draft: TaskDraft;
  readonly set: SetDraft;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('projectTeam.template');
  return (
    <div className="flex flex-col gap-5">
      <Switch
        checked={draft.confirmAssignee}
        onCheckedChange={(value) => set('confirmAssignee', value)}
        label={t('confirmAssignee')}
        description={t('confirmAssigneeHint')}
      />
      <Field
        label={t('escalateAfter')}
        hint={t('escalateAfterHint')}
        error={errors.escalateAfterDays}
        className="sm:max-w-xs"
      >
        <NumberInput
          unit="whole"
          value={draft.escalateAfterDays}
          onValueChange={(value) => set('escalateAfterDays', value)}
        />
      </Field>
    </div>
  );
}
