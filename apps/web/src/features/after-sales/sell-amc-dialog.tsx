'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import {
  Button,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { amcEndsOn, visitCount } from '@oneohm/domain';
import { formatInr, todayIn } from '@oneohm/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useAmcPlans } from '../settings/after-sales/use-after-sales-settings';
import { NumberInput } from '../settings/number-input';
import { dateOf, LONG_DATE, useRefreshAfterSales } from './use-project-after-sales';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Sell an AMC for a commissioned project: plan, start day and the price agreed. */
export function SellAmcDialog({
  open,
  project,
  commissionedOn,
  onClose,
}: {
  readonly open: boolean;
  readonly project: ProjectDetail;
  readonly commissionedOn: string | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('afterSales.project.sale');
  const format = useFormatter();
  const formId = useId();
  const toast = useToast();
  const form = useApiForm();
  const refresh = useRefreshAfterSales(project.id);
  const plans = useAmcPlans(open);
  const onSale = (plans.data ?? []).filter((plan) => plan.active);
  const [planId, setPlanId] = useState<string | undefined>(undefined);
  const [startsOn, setStartsOn] = useState('');
  const [price, setPrice] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const { reset } = form;
  const plan = onSale.find((item) => item.id === planId);

  useEffect(() => {
    if (!open) return;
    const today = todayIn();
    setStartsOn(commissionedOn && commissionedOn > today ? commissionedOn : today);
    setPlanId(undefined);
    setPrice(null);
    setNote('');
    reset();
  }, [open, commissionedOn, reset]);

  const choose = (id: string) => {
    setPlanId(id);
    setPrice(onSale.find((item) => item.id === id)?.pricePaise ?? null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!planId) return;
    await form.run(
      () =>
        expectStatus(
          api.afterSales.sellAmc({
            params: { id: project.id },
            body: { planId, startsOn, pricePaise: price ?? 0, ...(note.trim() ? { note } : {}) },
          }),
          201,
        ),
      async (sold) => {
        await refresh();
        toast({ tone: 'success', title: t('sold', { count: sold.visits.length }) });
        onClose();
      },
    );
  };

  const preview =
    plan && DATE.test(startsOn)
      ? t('preview', {
          count: visitCount(plan),
          date: format.dateTime(dateOf(amcEndsOn(startsOn, plan.durationMonths)), LONG_DATE),
        })
      : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('title')}
      description={t('description', { code: project.code })}
      footer={
        <Button
          type="submit"
          form={formId}
          variant="primary"
          pending={form.pending}
          disabled={!plan}
        >
          {t('submit')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        {plans.data && onSale.length === 0 ? (
          <p className="rounded-lg bg-sunken px-4 py-3 type-body-sm text-ink-muted">
            {t('noPlans')}
          </p>
        ) : (
          <Field label={t('plan')} error={form.fieldErrors.planId} required>
            <Select
              value={planId}
              onValueChange={choose}
              options={onSale.map((item) => ({
                value: item.id,
                label: t('planOption', { name: item.name, price: formatInr(item.pricePaise) }),
              }))}
            />
          </Field>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('startsOn')} error={form.fieldErrors.startsOn} required>
            <Input
              type="date"
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
            />
          </Field>
          <Field label={t('price')} error={form.fieldErrors.pricePaise}>
            <NumberInput unit="paise" value={price} onValueChange={setPrice} />
          </Field>
        </div>
        {preview && <p className="type-body-sm text-ink-muted">{preview}</p>}
        <Field label={t('note')} error={form.fieldErrors.note}>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder={t('notePlaceholder')}
          />
        </Field>
        <p className="type-body-sm text-ink-faint">{t('money')}</p>
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
