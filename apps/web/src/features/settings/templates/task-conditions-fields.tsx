'use client';

import { Checkbox, Field, Input, SegmentedControl } from '@oneohm/design-system/web';
import { EVIDENCE_KINDS, PROJECT_TYPES } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import type { SetDraft, TaskDraft } from './task-draft';

const FLAGS = ['loan', 'battery', 'groundMount', 'subsidy', 'nameChange'] as const;
type Tri = 'any' | 'yes' | 'no';

/** Which projects get the task, and the proof it needs. */
export function TaskConditionsFields({
  draft,
  set,
  errors,
}: {
  readonly draft: TaskDraft;
  readonly set: SetDraft;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('settings.taskTemplates.sheet');
  const typeT = useTranslations('commandCenter.filters.types');
  const evidenceT = useTranslations('projects.evidence');
  const types = draft.conditions.projectTypes ?? [];
  const setCondition = (patch: Partial<TaskDraft['conditions']>) =>
    set('conditions', { ...draft.conditions, ...patch });
  const tri = (flag: (typeof FLAGS)[number]): Tri => {
    const value = draft.conditions[flag];
    return value === undefined ? 'any' : value ? 'yes' : 'no';
  };
  return (
    <div className="flex flex-col gap-5">
      <Field label={t('projectTypes')} hint={t('anyType')}>
        <div className="flex flex-wrap gap-x-5">
          {PROJECT_TYPES.map((type) => (
            <Checkbox
              key={type}
              checked={types.includes(type)}
              label={typeT(type)}
              onCheckedChange={(on) =>
                setCondition({
                  projectTypes: on ? [...types, type] : types.filter((item) => item !== type),
                })
              }
            />
          ))}
        </div>
      </Field>
      <div className="flex flex-col gap-3">
        {FLAGS.map((flag) => (
          <div key={flag} className="flex flex-wrap items-center justify-between gap-3">
            <span className="type-body text-ink">{t(`flags.${flag}`)}</span>
            <SegmentedControl<Tri>
              size="sm"
              label={t(`flags.${flag}`)}
              value={tri(flag)}
              onValueChange={(value) =>
                setCondition({ [flag]: value === 'any' ? undefined : value === 'yes' })
              }
              options={(['any', 'yes', 'no'] as const).map((value) => ({
                value,
                label: t(`tri.${value}`),
              }))}
            />
          </div>
        ))}
      </div>
      <Field label={t('discoms')} hint={t('discomsHint')} error={errors['conditions.discomCodes']}>
        <Input
          value={draft.discomText}
          onChange={(e) => set('discomText', e.target.value)}
          className="font-mono uppercase"
        />
      </Field>
      <Field label={t('evidence')} error={errors.evidence}>
        <div className="flex flex-wrap gap-x-5">
          {EVIDENCE_KINDS.map((kind) => (
            <Checkbox
              key={kind}
              checked={draft.evidence.includes(kind)}
              label={evidenceT(kind)}
              onCheckedChange={(on) =>
                set(
                  'evidence',
                  on ? [...draft.evidence, kind] : draft.evidence.filter((item) => item !== kind),
                )
              }
            />
          ))}
        </div>
      </Field>
      <Field label={t('captures')} hint={t('capturesHint')} error={errors.captures}>
        <Input
          value={draft.capturesText}
          onChange={(e) => set('capturesText', e.target.value)}
          className="font-mono"
        />
      </Field>
    </div>
  );
}
