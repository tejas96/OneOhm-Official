'use client';

import type { ContractorDetail } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, Select, useToast } from '@oneohm/design-system/web';
import { DEFAULT_TASK_LIBRARY, PROJECT_TYPES, type RateBasis } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { NumberInput } from '@/features/settings/number-input';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useRefreshContractors } from './use-contractors';

const ANY = 'any';
const BASES: readonly RateBasis[] = ['per_kwp', 'per_job', 'per_day', 'per_task'];

/** One line of the rate card. Per-task rates name the task they pay for. */
export function AddRateDialog({
  contractor,
  open,
  onOpenChange,
}: {
  readonly contractor: ContractorDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('contractors.rates');
  const formId = useId();
  const toast = useToast();
  const refresh = useRefreshContractors();
  const form = useApiForm();
  const [basis, setBasis] = useState<RateBasis>('per_kwp');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [taskKey, setTaskKey] = useState<string>('');
  const [projectType, setProjectType] = useState<string>(ANY);
  const tasks = DEFAULT_TASK_LIBRARY.filter((task) => contractor.skills.includes(task.roleKey));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await form.run(() =>
      expectStatus(
        api.contractors.addContractorRate({
          params: { id: contractor.id },
          body: {
            basis,
            label: label.trim() || t(`basis.${basis}`),
            amountPaise: amount ?? 0,
            taskKey: basis === 'per_task' ? taskKey || null : null,
            projectType:
              projectType === ANY ? null : (projectType as (typeof PROJECT_TYPES)[number]),
          },
        }),
        201,
      ),
    );
    if (!saved) return;
    await refresh();
    toast({ tone: 'success', title: t('added') });
    setLabel('');
    setAmount(null);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('addTitle')}
      description={t('addDescription')}
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {t('addSubmit')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={t('fields.basis')}>
          <Select
            value={basis}
            onValueChange={setBasis}
            options={BASES.map((value) => ({ value, label: t(`basis.${value}`) }))}
          />
        </Field>
        {basis === 'per_task' && (
          <Field label={t('fields.task')} error={form.fieldErrors.taskKey}>
            <Select
              value={taskKey || undefined}
              onValueChange={setTaskKey}
              placeholder={t('pickTask')}
              options={tasks.map((task) => ({ value: task.key, label: task.title }))}
            />
          </Field>
        )}
        <Field label={t('fields.label')} error={form.fieldErrors.label}>
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={t(`basis.${basis}`)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('fields.amount', { unit: t(`unit.${basis}`) })}
            error={form.fieldErrors.amountPaise}
          >
            <NumberInput unit="paise" value={amount} onValueChange={setAmount} />
          </Field>
          <Field label={t('fields.projectType')}>
            <Select
              value={projectType}
              onValueChange={setProjectType}
              options={[
                { value: ANY, label: t('anyType') },
                ...PROJECT_TYPES.map((type) => ({ value: type, label: t(`types.${type}`) })),
              ]}
            />
          </Field>
        </div>
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
