'use client';

import { Button, Dialog, Field, Input, Select, useToast } from '@oneohm/design-system/web';
import { formatInr, todayIn } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useInvalidateFinance } from '../use-finance';
import { type PayoutTarget, payPayout } from './use-payouts';

const METHODS = ['bank_transfer', 'upi', 'cheque', 'cash'] as const;
type Method = (typeof METHODS)[number];

/** Records how an approved commission or reward was paid; the ledger books the bank side. */
export function PayPayoutDialog({
  target,
  onClose,
}: {
  readonly target: PayoutTarget | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('finance.payouts.payDialog');
  const methodT = useTranslations('finance.methods');
  const formId = useId();
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const form = useApiForm();
  const [method, setMethod] = useState<Method>('upi');
  const [paidOn, setPaidOn] = useState(todayIn());
  const [reference, setReference] = useState('');

  const close = () => {
    setReference('');
    setPaidOn(todayIn());
    form.reset();
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target) return;
    await form.run(
      () =>
        payPayout(target, {
          method,
          paidOn,
          reference: reference.trim() || null,
          ...(method === 'upi' && target.upiId ? { upiId: target.upiId } : {}),
        }),
      async () => {
        await invalidate();
        toast({ title: t('done'), description: target.party, tone: 'success' });
        close();
      },
    );
  };

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => !open && close()}
      title={t('title')}
      description={
        target
          ? t('description', { amount: formatInr(target.amountPaise), party: target.party })
          : undefined
      }
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {t('submit')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label={t('method')} error={form.fieldErrors.method}>
          <Select
            value={method}
            onValueChange={setMethod}
            options={METHODS.map((value) => ({ value, label: methodT(value) }))}
          />
        </Field>
        <Field label={t('paidOn')} required error={form.fieldErrors.paidOn}>
          <Input type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
        </Field>
        <Field
          label={t('reference')}
          hint={t('referenceHint')}
          error={form.fieldErrors.reference}
          className="sm:col-span-2"
        >
          <Input value={reference} onChange={(event) => setReference(event.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <FormError message={form.error} />
        </div>
      </form>
    </Dialog>
  );
}
