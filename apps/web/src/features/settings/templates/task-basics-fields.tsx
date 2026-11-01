'use client';

import type { TaskTemplateRecord } from '@oneohm/api-contracts';
import { Checkbox, Field, Input, Select, type SelectOption } from '@oneohm/design-system/web';
import { EPC_STAGES, WAITING_PARTIES } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { useSkills } from '@/features/team/skills/use-skills';
import { NumberInput } from '../number-input';
import type { SetDraft, TaskDraft } from './task-draft';

/** The Select needs a value; this one means "anyone in the role". */
const ANY_SKILL = '__any__';

/** Name, key, stage, owner, skill, timing and what it waits for. */
export function TaskBasicsFields({
  draft,
  set,
  errors,
  isNew,
  others,
  roles,
}: {
  readonly draft: TaskDraft;
  readonly set: SetDraft;
  readonly errors: Readonly<Record<string, string>>;
  readonly isNew: boolean;
  readonly others: readonly TaskTemplateRecord[];
  readonly roles: readonly SelectOption<string>[];
}) {
  const t = useTranslations('settings.taskTemplates.sheet');
  const stageT = useTranslations('stages');
  const skills = useSkills();
  const toggleWait = (key: string, on: boolean) =>
    set(
      'dependsOn',
      on ? [...draft.dependsOn, key] : draft.dependsOn.filter((item) => item !== key),
    );
  return (
    <div className="flex flex-col gap-5">
      <Field label={t('title')} error={errors.title} required>
        <Input value={draft.title} onChange={(e) => set('title', e.target.value)} />
      </Field>
      {isNew && (
        <Field label={t('key')} hint={t('keyHint')} error={errors.key} required>
          <Input
            value={draft.key}
            onChange={(e) => set('key', e.target.value)}
            className="font-mono"
          />
        </Field>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('stage')} error={errors.stage}>
          <Select
            value={draft.stage}
            onValueChange={(value) => set('stage', value)}
            options={EPC_STAGES.map((value) => ({ value, label: stageT(value) }))}
          />
        </Field>
        <Field label={t('role')} error={errors.roleKey} required>
          <Select
            value={draft.roleKey || undefined}
            onValueChange={(value) => set('roleKey', value)}
            options={roles}
          />
        </Field>
        <Field label={t('skill')} hint={t('skillHint')} error={errors.skillKey}>
          <Select
            value={draft.skillKey ?? ANY_SKILL}
            onValueChange={(value) => set('skillKey', value === ANY_SKILL ? null : value)}
            options={[
              { value: ANY_SKILL, label: t('anySkill') },
              ...(skills.data ?? [])
                .filter((skill) => skill.active || skill.key === draft.skillKey)
                .map((skill) => ({ value: skill.key, label: skill.name })),
            ]}
          />
        </Field>
        <Field label={t('offset')} hint={t('offsetHint')} error={errors.offsetDays}>
          <NumberInput
            unit="whole"
            value={draft.offsetDays}
            onValueChange={(value) => set('offsetDays', value ?? 0)}
          />
        </Field>
        <Field label={t('duration')} error={errors.durationDays}>
          <NumberInput
            unit="whole"
            value={draft.durationDays}
            onValueChange={(value) => set('durationDays', value ?? 1)}
          />
        </Field>
        <Field label={t('waiting')} error={errors.waitingParty}>
          <Select
            value={draft.waitingParty}
            onValueChange={(value) => set('waitingParty', value)}
            options={WAITING_PARTIES.map((value) => ({ value, label: t(`parties.${value}`) }))}
          />
        </Field>
      </div>
      <Field label={t('dependsOn')} hint={t('dependsOnHint')} error={errors.dependsOn}>
        <div className="max-h-56 overflow-y-auto rounded-lg border border-hairline px-3 py-1">
          {others.map((other) => (
            <Checkbox
              key={other.key}
              checked={draft.dependsOn.includes(other.key)}
              onCheckedChange={(on) => toggleWait(other.key, on)}
              label={other.title}
              description={stageT(other.stage)}
            />
          ))}
        </div>
      </Field>
    </div>
  );
}
