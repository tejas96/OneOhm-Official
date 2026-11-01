'use client';

import type { Payable } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, Select, useToast } from '@oneohm/design-system/web';
import { formatInr, todayIn } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useInvalidateFinance } from '../use-finance';

const METHODS = ['bank_transfer', 'upi', 'cheque', 'cash'] as const;
type Method = (typeof METHODS)[number];

/** Pays an approved bill: how, when and the bank reference, posted to the ledger. */
export function PayBillDialog({
  bill,
  onClose,
}: {
  readonly bill: Payable | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('finance.payables.payDialog');
  const methodT = useTranslations('finance.methods');
  const formId = useId();
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const form = useApiForm();
  const [method, setMethod] = useState<Method>('bank_transfer');
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
    if (!bill) return;
    const paid = await form.run(() =>
      expectStatus(
        api.finance.payPayable({
          params: { id: bill.id },
          body: { method, paidOn, reference: reference.trim() || null },
        }),
        200,
      ),
    );
    if (!paid) return;
    await invalidate();
    toast({ title: t('done'), description: paid.partyName, tone: 'success' });
    close();
  };

  return (
    <Dialog
      open={bill !== null}
      onOpenChange={(open) => !open && close()}
      title={t('title')}
      description={
        bill
          ? t('description', {
              amount: formatInr(bill.amountPaise - bill.advanceAdjustedPaise),
              party: bill.partyName,
            })
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
