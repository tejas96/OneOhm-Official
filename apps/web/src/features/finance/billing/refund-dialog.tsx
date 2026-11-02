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
import { formatInr, rupeesToPaise, todayIn } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { parseNumber } from '@/lib/forms/checks';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useInvalidateFinance } from '../use-finance';

type Milestone = ProjectDetail['milestones'][number];
const METHODS = ['bank_transfer', 'upi', 'razorpay', 'cheque', 'cash'] as const;
type Method = (typeof METHODS)[number];
const CREDIT = 'credit';

const rupees = (paise: number) => (paise > 0 ? String(paise / 100) : '');

/**
 * Pays money back to the customer: out of their credit, or out of what they paid
 * towards one milestone (which then reopens). Posted to the ledger as money out.
 */
export function RefundDialog({
  projectId,
  creditPaise,
  milestones,
  open,
  onClose,
}: {
  readonly projectId: string;
  readonly creditPaise: number;
  readonly milestones: readonly Milestone[];
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const t = useTranslations('finance.billing.refundDialog');
  const methodT = useTranslations('finance.billing.refundMethods');
  const formId = useId();
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const form = useApiForm();
  const checkT = useTranslations('checks');
  const [checks, setChecks] = useState<Record<string, string>>({});
  const fieldError = (key: string) => checks[key] ?? form.fieldErrors[key];
  const paidTowards = milestones.filter((m) => m.payer === 'customer' && m.paidPaise > 0);
  const [source, setSource] = useState(creditPaise > 0 ? CREDIT : (paidTowards[0]?.id ?? CREDIT));
  const [amount, setAmount] = useState(creditPaise > 0 ? rupees(creditPaise) : '');
  const [method, setMethod] = useState<Method>('bank_transfer');
  const [paidOn, setPaidOn] = useState(todayIn());
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.pending) return;
    const found: Record<string, string> = {};
    const value = parseNumber(amount);
    if (value === null || value <= 0) found.amountPaise = checkT('positiveAmount');
    if (!paidOn) found.paidOn = checkT('required');
    else if (paidOn > todayIn()) found.paidOn = checkT('dateNotFuture');
    if (!reason.trim()) found.reason = checkT('required');
    setChecks(found);
    if (Object.keys(found).length > 0 || value === null) return;
    await form.run(
      () =>
        expectStatus(
          api.billing.recordRefund({
            params: { projectId },
            body: {
              milestoneId: source === CREDIT ? null : source,
              amountPaise: rupeesToPaise(value),
              method,
              paidOn,
              reference: reference.trim() || null,
              reason: reason.trim(),
            },
          }),
          201,
        ),
      async (done) => {
        await invalidate();
        toast({ title: t('done'), description: formatInr(done.amountPaise), tone: 'success' });
        onClose();
      },
    );
  };

  const sources = [
    ...(creditPaise > 0 ? [{ value: CREDIT, label: t('fromCredit'), paise: creditPaise }] : []),
    ...paidTowards.map((m) => ({ value: m.id, label: m.label, paise: m.paidPaise })),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('title')}
      description={t('description')}
      autoFocusField
      footer={
        <>
          <Button type="button" variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" pending={form.pending}>
            {t('submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label={t('source')} className="sm:col-span-2" error={form.fieldErrors.milestoneId}>
          <Select
            value={source}
            onValueChange={(value) => {
              setSource(value);
              // Credit is usually refunded whole; milestone money is typed, never assumed.
              setAmount(value === CREDIT ? rupees(creditPaise) : '');
            }}
            options={sources.map((entry) => ({
              value: entry.value,
              label: entry.label,
              description: t('available', { amount: formatInr(entry.paise) }),
            }))}
          />
        </Field>
        {source !== CREDIT && (
          <p className="type-body-sm text-ink-muted sm:col-span-2">{t('reopens')}</p>
        )}
        <Field label={t('amount')} required error={fieldError('amountPaise')}>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            leading={<span className="type-body text-ink-faint">₹</span>}
          />
        </Field>
        <Field label={t('method')} error={form.fieldErrors.method}>
          <Select
            value={method}
            onValueChange={setMethod}
            options={METHODS.map((value) => ({ value, label: methodT(value) }))}
          />
        </Field>
        <Field label={t('paidOn')} required error={fieldError('paidOn')}>
          <Input
            type="date"
            max={todayIn()}
            value={paidOn}
            onChange={(event) => setPaidOn(event.target.value)}
          />
        </Field>
        <Field label={t('reference')} hint={t('referenceHint')} error={form.fieldErrors.reference}>
          <Input value={reference} onChange={(event) => setReference(event.target.value)} />
        </Field>
        <Field
          label={t('reason')}
          hint={t('reasonHint')}
          required
          error={fieldError('reason')}
          className="sm:col-span-2"
        >
          <Textarea value={reason} rows={2} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <FormError message={form.error} />
        </div>
      </form>
    </Dialog>
  );
}
