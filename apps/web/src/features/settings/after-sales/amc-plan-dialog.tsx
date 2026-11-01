'use client';

import type { AmcPlan, AmcPlanInput } from '@oneohm/api-contracts';
import {
  Button,
  Dialog,
  Field,
  Input,
  Switch,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { NumberInput } from '../number-input';
import { AFTER_SALES_KEYS } from './use-after-sales-settings';

type Draft = Omit<AmcPlanInput, 'includes'> & { readonly includes: string };

const BLANK: Draft = {
  name: '',
  pricePaise: 0,
  visitsPerYear: 4,
  durationMonths: 12,
  visitName: 'cleaning',
  includes: '',
  active: true,
};

const toDraft = (plan: AmcPlan): Draft => ({ ...plan, includes: plan.includes.join('\n') });

/** Add or change an AMC plan; `plan` null adds. */
export function AmcPlanDialog({
  open,
  plan,
  onClose,
}: {
  readonly open: boolean;
  readonly plan: AmcPlan | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('afterSales.amc.dialog');
  const settingsT = useTranslations('settings');
  const formId = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useApiForm();
  const [draft, setDraft] = useState<Draft>(BLANK);
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    setDraft(plan ? toDraft(plan) : BLANK);
    reset();
  }, [open, plan, reset]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body: AmcPlanInput = {
      name: draft.name,
      pricePaise: draft.pricePaise,
      visitsPerYear: draft.visitsPerYear,
      durationMonths: draft.durationMonths,
      visitName: draft.visitName,
      includes: draft.includes
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
      active: draft.active,
    };
    const saved = await form.run(() =>
      plan
        ? expectStatus(api.afterSales.updateAmcPlan({ params: { id: plan.id }, body }), 200)
        : expectStatus(api.afterSales.createAmcPlan({ body }), 201),
    );
    if (!saved) return;
    await queryClient.invalidateQueries({ queryKey: AFTER_SALES_KEYS.plans });
    toast({
      tone: 'success',
      title: plan ? t('updated', { name: saved.name }) : t('created', { name: saved.name }),
    });
    onClose();
  };

  const errors = form.fieldErrors;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={plan ? t('editTitle') : t('createTitle')}
      description={plan ? t('applies') : undefined}
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {plan ? settingsT('save') : t('create')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Field label={t('name')} error={errors.name} required>
          <Input value={draft.name} onChange={(event) => set('name', event.target.value)} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label={t('price')} error={errors.pricePaise}>
            <NumberInput
              unit="paise"
              value={draft.pricePaise}
              onValueChange={(value) => set('pricePaise', value ?? 0)}
            />
          </Field>
          <Field label={t('visitsPerYear')} error={errors.visitsPerYear}>
            <NumberInput
              unit="whole"
              value={draft.visitsPerYear}
              onValueChange={(value) => set('visitsPerYear', value ?? 0)}
            />
          </Field>
          <Field label={t('durationMonths')} error={errors.durationMonths}>
            <NumberInput
              unit="whole"
              value={draft.durationMonths}
              onValueChange={(value) => set('durationMonths', value ?? 0)}
            />
          </Field>
        </div>
        <Field
          label={t('visitName')}
          hint={t('visitNameHint', { example: draft.visitName.trim() || '…' })}
          error={errors.visitName}
        >
          <Input
            value={draft.visitName}
            onChange={(event) => set('visitName', event.target.value)}
          />
        </Field>
        <Field label={t('includes')} hint={t('includesHint')} error={errors.includes}>
          <Textarea
            value={draft.includes}
            onChange={(event) => set('includes', event.target.value)}
            rows={4}
          />
        </Field>
        <Switch
          checked={draft.active}
          onCheckedChange={(value) => set('active', value)}
          label={t('active')}
        />
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
