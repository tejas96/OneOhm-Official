'use client';

import { Button, Checkbox, Field, IconButton, Input, Select } from '@oneohm/design-system/web';
import { CHANGE_REQUEST_CAPTURES, WAITING_PARTIES, type WaitingParty } from '@oneohm/domain';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NumberInput } from '../../number-input';
import { blankStep, type StepDraft, toggled } from './change-type-draft';

/**
 * The request's steps in order (PRD 3.15 "task template"): what happens, the role that
 * does it, who it waits on, the days it is expected to take, and what it records.
 */
export function StepListEditor({
  steps,
  onChange,
  roles,
  errors,
}: {
  readonly steps: readonly StepDraft[];
  readonly onChange: (steps: StepDraft[]) => void;
  readonly roles: readonly { readonly value: string; readonly label: string }[];
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('discomSetup');
  const captureT = useTranslations('discom.captures');
  const set = (index: number, patch: Partial<StepDraft>) =>
    onChange(steps.map((step, at) => (at === index ? { ...step, ...patch } : step)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...steps];
    const [step] = next.splice(index, 1);
    if (step) next.splice(index + by, 0, step);
    onChange(next);
  };
  const defaultRole = roles.find((role) => role.value === 'liaisoning')?.value ?? roles[0]?.value;

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => {
          const number = index + 1;
          const at = (field: string) => errors[`steps.${index}.${field}`];
          return (
            <li
              key={step.uid}
              className="flex flex-col gap-4 rounded-xl border border-hairline p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="type-overline text-ink-faint uppercase">
                  {t('changes.sheet.stepTitle', { number })}
                </span>
                <span className="flex items-center gap-1">
                  <IconButton
                    size="sm"
                    label={t('changes.sheet.moveUp', { number })}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp aria-hidden className="size-4" />
                  </IconButton>
                  <IconButton
                    size="sm"
                    label={t('changes.sheet.moveDown', { number })}
                    disabled={index === steps.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown aria-hidden className="size-4" />
                  </IconButton>
                  <IconButton
                    size="sm"
                    label={t('changes.sheet.remove', { number })}
                    onClick={() => onChange(steps.filter((_, i) => i !== index))}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </IconButton>
                </span>
              </div>
              <Field label={t('changes.sheet.stepName')} error={at('title')}>
                <Input value={step.title} onChange={(e) => set(index, { title: e.target.value })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={t('changes.sheet.role')} error={at('roleKey')}>
                  <Select
                    value={step.roleKey}
                    onValueChange={(roleKey) => set(index, { roleKey })}
                    options={roles}
                  />
                </Field>
                <Field label={t('changes.sheet.waitsOn')} error={at('waitingParty')}>
                  <Select<WaitingParty>
                    value={step.waitingParty}
                    onValueChange={(waitingParty) => set(index, { waitingParty })}
                    options={WAITING_PARTIES.map((value) => ({
                      value,
                      label: t(`parties.${value}`),
                    }))}
                  />
                </Field>
                <Field label={t('changes.sheet.days')} error={at('durationDays')}>
                  <NumberInput
                    unit="whole"
                    value={step.durationDays}
                    onValueChange={(days) => set(index, { durationDays: days ?? 0 })}
                  />
                </Field>
              </div>
              <Field label={t('changes.sheet.records')} error={at('captures')}>
                <div className="grid gap-x-5 sm:grid-cols-3">
                  {CHANGE_REQUEST_CAPTURES.map((capture) => (
                    <Checkbox
                      key={capture}
                      checked={step.captures.includes(capture)}
                      label={captureT(capture)}
                      onCheckedChange={(on) =>
                        set(index, {
                          captures: toggled(step.captures, capture, on, CHANGE_REQUEST_CAPTURES),
                        })
                      }
                    />
                  ))}
                </div>
              </Field>
            </li>
          );
        })}
      </ol>
      <Button
        variant="secondary"
        leadingIcon={<Plus />}
        className="self-start"
        onClick={() =>
          onChange([...steps, blankStep(t('changes.sheet.newStep'), defaultRole ?? '')])
        }
      >
        {t('changes.sheet.addStep')}
      </Button>
    </div>
  );
}
