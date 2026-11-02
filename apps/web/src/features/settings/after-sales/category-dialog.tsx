'use client';

import type { ServiceCategory, ServiceCategoryInput } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, Switch, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { NumberInput } from '../number-input';
import { AFTER_SALES_KEYS } from './use-after-sales-settings';

const BLANK: ServiceCategoryInput = {
  label: '',
  customerLabel: '',
  responseHours: 24,
  resolutionHours: 72,
  active: true,
};

/** Add a service category, or change one's words and hours; `category` null adds. */
export function CategoryDialog({
  open,
  category,
  onClose,
}: {
  readonly open: boolean;
  readonly category: ServiceCategory | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('afterSales.categories.dialog');
  const settingsT = useTranslations('settings');
  const formId = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useApiForm();
  const [draft, setDraft] = useState<ServiceCategoryInput>(BLANK);
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    setDraft(
      category
        ? {
            label: category.label,
            customerLabel: category.customerLabel,
            responseHours: category.responseHours,
            resolutionHours: category.resolutionHours,
            active: category.active,
          }
        : BLANK,
    );
    reset();
  }, [open, category, reset]);

  const set = <K extends keyof ServiceCategoryInput>(key: K, value: ServiceCategoryInput[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = { ...draft, customerLabel: category?.system ? draft.label : draft.customerLabel };
    await form.run(
      () =>
        category
          ? expectStatus(
              api.afterSales.updateServiceCategory({ params: { id: category.id }, body }),
              200,
            )
          : expectStatus(api.afterSales.createServiceCategory({ body }), 201),
      async (saved) => {
        await queryClient.invalidateQueries({ queryKey: AFTER_SALES_KEYS.categories });
        toast({
          tone: 'success',
          title: category
            ? t('updated', { name: saved.label })
            : t('created', { name: saved.label }),
        });
        onClose();
      },
    );
  };

  const errors = form.fieldErrors;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={category ? t('editTitle') : t('createTitle')}
      description={t('applies')}
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {category ? settingsT('save') : t('create')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Field label={t('label')} error={errors.label} required>
          <Input value={draft.label} onChange={(event) => set('label', event.target.value)} />
        </Field>
        {!category?.system && (
          <Field label={t('customerLabel')} error={errors.customerLabel} required>
            <Input
              value={draft.customerLabel}
              onChange={(event) => set('customerLabel', event.target.value)}
            />
          </Field>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('responseHours')} hint={t('hoursHint')} error={errors.responseHours}>
            <NumberInput
              unit="whole"
              value={draft.responseHours}
              onValueChange={(value) => set('responseHours', value ?? 0)}
            />
          </Field>
          <Field label={t('resolutionHours')} error={errors.resolutionHours}>
            <NumberInput
              unit="whole"
              value={draft.resolutionHours}
              onValueChange={(value) => set('resolutionHours', value ?? 0)}
            />
          </Field>
        </div>
        {!category?.system && (
          <div className="flex flex-col gap-1">
            <Switch
              checked={draft.active}
              onCheckedChange={(value) => set('active', value)}
              label={t('active')}
            />
            <p className="type-body-sm text-ink-faint">{t('activeHint')}</p>
          </div>
        )}
        <FormError message={form.error ?? errors.active ?? null} />
      </form>
    </Dialog>
  );
}
