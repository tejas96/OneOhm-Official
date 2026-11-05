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
import { AmountBox } from './bank/amount-box';
import { BankTransferPanel } from './bank/bank-transfer-panel';
import { payoutIsOpen } from './bank/payout-status';
import { usePayoutOptions } from './bank/use-payouts';
import { BillPayments } from './bill-payments';
import { checkPayBill, usePayBillTexts } from './pay-bill-checks';

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
  // Until the person types, the amount is all that is left on the bill.
  const [typed, setTyped] = useState<number | null | undefined>(undefined);
  const left = bill?.leftPaise ?? 0;
  const amount = typed === undefined ? left : typed;
  // Rules shown while typing; the button waits until every one is met.
  const checks = checkPayBill({ amount, left, paidOn, today: todayIn(), method, reference });
  const { dateProblem, referenceProblem, referenceHint } = usePayBillTexts(checks);
  const ready = checks.ready;
  // RazorpayX on: send by bank first; recording a payment made elsewhere stays one tap away.
  const payouts = usePayoutOptions(bill?.id ?? null);
  // While it loads or fails to load, show the bank side (it has the skeleton and the retry).
  const bankOn = payouts.isPending || payouts.isError || payouts.data.mode !== 'off';
  // A transfer on its way: recording a payment by hand is blocked (the server says so too).
  const transferOpen = payoutIsOpen(payouts.data?.latest);
  const [way, setWay] = useState<'bank' | 'record'>('bank');
  const recording = !bankOn || way === 'record';

  const close = () => {
    setReference('');
    setTyped(undefined);
    setPaidOn(todayIn());
    setWay('bank');
    form.reset();
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bill || form.pending) return;
    if (!ready) return;
    await form.run(
      () =>
        expectStatus(
          api.finance.payPayable({
            params: { id: bill.id },
            body: {
              method,
              paidOn,
              reference: reference.trim() || null,
              amountPaise: amount ?? 0,
            },
          }),
          200,
        ).catch(async (caught: unknown) => {
          // Someone may have paid meanwhile: fetch the bill again so "left" is the truth.
          await invalidate();
          throw caught;
        }),
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
                amount: formatInr(left),
                party: bill.partyName,
                tds: formatInr(bill.tdsPaise),
              })
            : t('description', { amount: formatInr(left), party: bill.partyName })
          : undefined
      }
      autoFocusField
      footer={
        recording ? (
          <Button
            type="submit"
            form={formId}
            variant="primary"
            pending={form.pending}
            disabled={transferOpen || !ready}
          >
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
      {bill && !recording && <BankTransferPanel bill={bill} />}
      {recording && (
        <form id={formId} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <AmountBox
              label={t('amount')}
              hint={t('amountHint')}
              amount={amount}
              left={left}
              check={checks.amount}
              serverError={form.fieldErrors.amountPaise}
              onChange={(value) => {
                setTyped(value);
                form.reset();
              }}
            />
          </div>
          <Field label={t('method')} error={form.fieldErrors.method}>
            <Select
              value={method}
              onValueChange={(value) => {
                setMethod(value);
                form.reset();
              }}
              options={METHODS.map((value) => ({ value, label: methodT(value) }))}
            />
          </Field>
          <Field label={t('paidOn')} required error={dateProblem ?? form.fieldErrors.paidOn}>
            <Input
              type="date"
              max={todayIn()}
              value={paidOn}
              onChange={(event) => {
                setPaidOn(event.target.value);
                form.reset();
              }}
            />
          </Field>
          <Field
            label={t('reference')}
            hint={referenceHint}
            error={referenceProblem ?? form.fieldErrors.reference}
            className="sm:col-span-2"
          >
            <Input
              value={reference}
              onChange={(event) => {
                setReference(event.target.value);
                form.reset();
              }}
            />
          </Field>
          {transferOpen && (
            <p
              role="status"
              className="rounded-md bg-at-risk-tint px-3 py-2.5 type-body-sm text-ink sm:col-span-2"
            >
              {t('transferOpen')}
            </p>
          )}
          <div className="sm:col-span-2">
            <FormError message={form.error} />
          </div>
        </form>
      )}
      {bill && <BillPayments bill={bill} />}
    </Dialog>
  );
}
