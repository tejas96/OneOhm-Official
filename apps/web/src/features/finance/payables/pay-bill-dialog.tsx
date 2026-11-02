'use client';

import type { Payable } from '@oneohm/api-contracts';
import {
  Button,
  Dialog,
  Field,
  Input,
  SegmentedControl,
  Select,
  useToast,
} from '@oneohm/design-system/web';
import { formatInr, todayIn } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useInvalidateFinance } from '../use-finance';
import { BankTransferPanel } from './bank/bank-transfer-panel';
import { usePayoutOptions } from './bank/use-payouts';

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
  const checkT = useTranslations('checks');
  const [dateError, setDateError] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>('bank_transfer');
  const [paidOn, setPaidOn] = useState(todayIn());
  const [reference, setReference] = useState('');
  // RazorpayX on: send by bank first; recording a payment made elsewhere stays one tap away.
  const payouts = usePayoutOptions(bill?.id ?? null);
  const bankOn = (payouts.data?.mode ?? 'off') !== 'off';
  const [way, setWay] = useState<'bank' | 'record'>('bank');
  const recording = !bankOn || way === 'record';

  const close = () => {
    setReference('');
    setPaidOn(todayIn());
    setWay('bank');
    setDateError(null);
    form.reset();
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bill || form.pending) return;
    const problem = !paidOn
      ? checkT('required')
      : paidOn > todayIn()
        ? checkT('dateNotFuture')
        : null;
    setDateError(problem);
    if (problem) return;
    await form.run(
      () =>
        expectStatus(
          api.finance.payPayable({
            params: { id: bill.id },
            body: { method, paidOn, reference: reference.trim() || null },
          }),
          200,
        ),
      async (paid) => {
        await invalidate();
        toast({ title: t('done'), description: paid.partyName, tone: 'success' });
        close();
      },
    );
  };

  return (
    <Dialog
      open={bill !== null}
      onOpenChange={(open) => !open && close()}
      title={t('title')}
      description={
        bill
          ? bill.tdsPaise > 0
            ? t('descriptionTds', {
                amount: formatInr(bill.toPayPaise),
                party: bill.partyName,
                tds: formatInr(bill.tdsPaise),
              })
            : t('description', { amount: formatInr(bill.toPayPaise), party: bill.partyName })
          : undefined
      }
      autoFocusField
      footer={
        recording ? (
          <Button type="submit" form={formId} variant="primary" pending={form.pending}>
            {t('submit')}
          </Button>
        ) : undefined
      }
    >
      {bankOn && (
        <SegmentedControl<'bank' | 'record'>
          label={t('way')}
          size="sm"
          value={way}
          onValueChange={setWay}
          options={[
            { value: 'bank', label: t('ways.bank') },
            { value: 'record', label: t('ways.record') },
          ]}
          className="mb-4"
        />
      )}
      {bill && !recording && <BankTransferPanel bill={bill} onSent={close} />}
      {recording && (
        <form id={formId} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label={t('method')} error={form.fieldErrors.method}>
            <Select
              value={method}
              onValueChange={setMethod}
              options={METHODS.map((value) => ({ value, label: methodT(value) }))}
            />
          </Field>
          <Field label={t('paidOn')} required error={dateError ?? form.fieldErrors.paidOn}>
            <Input
              type="date"
              max={todayIn()}
              value={paidOn}
              onChange={(event) => setPaidOn(event.target.value)}
            />
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
      )}
    </Dialog>
  );
}
