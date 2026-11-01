'use client';

import { Checkbox, Field, SegmentedControl, Textarea } from '@oneohm/design-system/web';
import { EVIDENCE_KINDS, PROJECT_TYPES } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { DiscomPick } from './discom-pick';
import { FactPick } from './fact-pick';
import type { SetDraft, TaskDraft } from './task-draft';
import { TaskReportsPick } from './task-reports-pick';

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
      <DiscomPick
        value={draft.conditions.discomCodes ?? []}
        onChange={(discomCodes) => setCondition({ discomCodes })}
        error={errors['conditions.discomCodes']}
      />
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
      {draft.evidence.includes('checklist') && (
        <Field label={t('checklist')} hint={t('checklistHint')} error={errors.checklist}>
          <Textarea
            value={draft.checklistText}
            rows={5}
            onChange={(e) => set('checklistText', e.target.value)}
          />
        </Field>
      )}
      <FactPick
        value={draft.captures}
        onChange={(captures) => set('captures', captures)}
        error={errors.captures}
      />
      <TaskReportsPick
        value={draft.reports}
        onChange={(reports) => set('reports', reports)}
        error={errors.reports}
      />
    </div>
  );
}
