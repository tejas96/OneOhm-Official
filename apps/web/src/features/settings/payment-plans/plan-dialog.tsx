'use client';

import type { PaymentPlan, PaymentPlanInput } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, Switch, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { PlanStepsEditor } from './plan-steps-editor';
import { PLANS_KEY } from './use-payment-plans';

const BLANK: PaymentPlanInput = {
  name: '',
  steps: [
    { label: 'Advance', shareBp: 5000, trigger: 'quotation_accepted' },
    { label: 'On completion', shareBp: 5000, trigger: 'commissioning_completed' },
  ],
  active: true,
};

/** Add or edit payment terms; `plan` null with `open` adds a new plan. */
export function PlanDialog({
  open,
  plan,
  onClose,
}: {
  readonly open: boolean;
  readonly plan: PaymentPlan | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('settings.paymentPlans');
  const settingsT = useTranslations('settings');
  const formId = useId();
  const toast = useToast();
  const client = useQueryClient();
  const form = useApiForm();
  const { reset } = form;
  const [draft, setDraft] = useState<PaymentPlanInput>(BLANK);

  useEffect(() => {
    if (!open) return;
    setDraft(
      plan
        ? {
            name: plan.name,
            active: plan.active,
            steps: plan.steps.map(({ key: _key, ...step }) => step),
          }
        : BLANK,
    );
    reset();
  }, [open, plan, reset]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await form.run(
      () =>
        plan
          ? expectStatus(api.paymentPlans.update({ params: { id: plan.id }, body: draft }), 200)
          : expectStatus(api.paymentPlans.create({ body: draft }), 201),
      async (saved) => {
        await client.invalidateQueries({ queryKey: PLANS_KEY });
        toast({ title: t('saved', { name: saved.name }), tone: 'success' });
        onClose();
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={plan ? t('editTitle') : t('createTitle')}
      description={t('dialogHint')}
      size="lg"
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {plan ? settingsT('save') : t('create')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Field label={t('name')} error={form.fieldErrors.name} required>
          <Input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Field>
        <PlanStepsEditor
          steps={draft.steps}
          onChange={(steps) => setDraft({ ...draft, steps })}
          errors={form.fieldErrors}
        />
        <Switch
          checked={draft.active}
          onCheckedChange={(active) => setDraft({ ...draft, active })}
          label={t('active')}
        />
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
