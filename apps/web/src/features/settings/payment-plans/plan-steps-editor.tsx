'use client';

import type { PaymentPlanInput } from '@oneohm/api-contracts';
import { Button, cn, IconButton, Input, Select } from '@oneohm/design-system/web';
import { CUSTOMER_TRIGGERS } from '@oneohm/domain';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NumberInput } from '../number-input';
import { stepErrors } from './plan-step-errors';

type Step = PaymentPlanInput['steps'][number];

/** One row per payment: what it is, its share and what makes it due; shares make 100%. */
export function PlanStepsEditor({
  steps,
  onChange,
  errors,
}: {
  readonly steps: readonly Step[];
  readonly onChange: (steps: Step[]) => void;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('settings.paymentPlans');
  const total = steps.reduce((sum, step) => sum + step.shareBp, 0);
  const change = (index: number, patch: Partial<Step>) =>
    onChange(steps.map((step, at) => (at === index ? { ...step, ...patch } : step)));
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => (
          <li
            key={index}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg border border-hairline p-3 sm:grid-cols-[minmax(0,1fr)_7rem_12rem_auto] sm:items-start"
          >
            <Input
              value={step.label}
              onChange={(event) => change(index, { label: event.target.value })}
              placeholder={t('stepLabel')}
              aria-label={t('stepLabel')}
              aria-invalid={Boolean(errors[`steps.${index}.label`]) || undefined}
            />
            <NumberInput
              unit="basisPoints"
              value={step.shareBp}
              onValueChange={(value) => change(index, { shareBp: value ?? 0 })}
              aria-label={t('stepShare')}
              aria-invalid={Boolean(errors[`steps.${index}.shareBp`]) || undefined}
              className="sm:order-none"
            />
            <Select
              label={t('stepTrigger')}
              value={step.trigger}
              onValueChange={(trigger) => change(index, { trigger })}
              options={CUSTOMER_TRIGGERS.map((value) => ({ value, label: t(`triggers.${value}`) }))}
              className="col-span-2 sm:col-span-1"
            />
            <IconButton
              label={t('removeStep')}
              onClick={() => onChange(steps.filter((_, at) => at !== index))}
              className="row-start-1 col-start-2 sm:row-auto sm:col-auto"
            >
              <Trash2 />
            </IconButton>
            {stepErrors(errors, index).length > 0 && (
              <p className="col-span-full type-body-sm text-overdue">
                {stepErrors(errors, index).join(' ')}
              </p>
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="quiet"
          size="sm"
          leadingIcon={<Plus />}
          onClick={() =>
            onChange([...steps, { label: '', shareBp: 0, trigger: 'commissioning_completed' }])
          }
          disabled={steps.length >= 8}
        >
          {t('addStep')}
        </Button>
        <span
          className={cn(
            'type-body-sm tabular-nums',
            total === 10_000 ? 'text-on-track' : 'text-overdue',
          )}
        >
          {t('total', { percent: total / 100 })}
        </span>
      </div>
      {(errors.total || errors.steps) && (
        <p className="type-body-sm text-overdue">{errors.total ?? errors.steps}</p>
      )}
    </div>
  );
}
