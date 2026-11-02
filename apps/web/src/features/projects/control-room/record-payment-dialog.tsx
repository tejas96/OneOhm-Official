'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, Select, useToast } from '@oneohm/design-system/web';
import { CUSTOMER_TDS_METHODS } from '@oneohm/domain';
import { formatInr, rupeesToPaise, todayIn } from '@oneohm/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError, describeError } from '@/lib/api/api-error';
import {
  amountProblem,
  type CheckKey,
  happenedOnProblem,
  optionalNotNegativeProblem,
  parseNumber,
} from '@/lib/forms/checks';
import { useInvalidateWork } from '../tasks/use-task-actions';
import { type Collected, CollectedFields } from './collected-fields';

type Milestone = ProjectDetail['milestones'][number];
const METHODS = [
  'upi',
  'bank_transfer',
  'cheque',
  'cash',
  'razorpay',
  'bank_disbursement',
] as const;
type Method = (typeof METHODS)[number];

/** Only cash and cheques carry who holds them and the cheque's details. */
function collectedBody(method: Method, collected: Collected) {
  if (method !== 'cash' && method !== 'cheque') return {};
  return {
    collectedByUserId: collected.collectedByUserId || null,
    ...(method === 'cheque'
      ? {
          chequeNumber: collected.chequeNumber.trim() || null,
          chequeBank: collected.chequeBank.trim() || null,
          chequeDate: collected.chequeDate || null,
        }
      : {}),
  };
}

const NO_COLLECTED: Collected = {
  collectedByUserId: '',
  chequeNumber: '',
  chequeBank: '',
  chequeDate: '',
};

const remaining = (milestone: Milestone) => milestone.amountPaise - milestone.paidPaise;
const toRupees = (paise: number) => String(paise / 100);
const paiseOf = (text: string) => rupeesToPaise(Number(text.replace(/,/g, '')) || 0);
/** A business customer may deduct TDS when it pays through a bank. */
const takesTds = (method: Method) => (CUSTOMER_TDS_METHODS as readonly string[]).includes(method);

/** Records money received against one milestone; the bank's share arrives as a disbursement. */
export function RecordPaymentDialog({
  projectId,
  milestones,
  open,
  onOpenChange,
}: {
  readonly projectId: string;
  readonly milestones: readonly Milestone[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('projects.money');
  const methodT = useTranslations('projects.money.methods');
  const checkT = useTranslations('checks');
  const toast = useToast();
  const client = useQueryClient();
  const invalidate = useInvalidateWork();
  const formId = useId();
  const first = milestones.find((milestone) => milestone.status !== 'upcoming') ?? milestones[0];
  const [milestoneId, setMilestoneId] = useState(first?.id ?? '');
  const [amount, setAmount] = useState(first ? toRupees(remaining(first)) : '');
  const [method, setMethod] = useState<Method>(
    first?.payer === 'bank' ? 'bank_disbursement' : 'upi',
  );
  const [receivedOn, setReceivedOn] = useState(todayIn());
  const [reference, setReference] = useState('');
  const [tds, setTds] = useState('');
  const [collected, setCollected] = useState<Collected>(NO_COLLECTED);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});

  // Each opening starts fresh from the first milestone still due.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the dialog opens
  useEffect(() => {
    if (!open) return;
    setMilestoneId(first?.id ?? '');
    setAmount(first ? toRupees(remaining(first)) : '');
    setMethod(first?.payer === 'bank' ? 'bank_disbursement' : 'upi');
    setReceivedOn(todayIn());
    setReference('');
    setTds('');
    setCollected(NO_COLLECTED);
    setError(null);
    setFieldErrors({});
  }, [open]);
  const milestone = milestones.find((candidate) => candidate.id === milestoneId);
  const bank = milestone?.payer === 'bank';
  const withTds = !bank && takesTds(method);
  const tdsPaise = withTds ? paiseOf(tds) : 0;

  const record = useMutation({
    mutationFn: () =>
      expectStatus(
        api.projects.recordPayment({
          params: { id: projectId },
          body: {
            milestoneId,
            amountPaise: rupeesToPaise(parseNumber(amount) ?? 0),
            ...(tdsPaise > 0 ? { tdsPaise } : {}),
            method: bank ? 'bank_disbursement' : method,
            receivedOn,
            reference: reference.trim() || null,
            ...collectedBody(bank ? 'bank_disbursement' : method, collected),
          },
        }),
        201,
      ),
    onSuccess: async (project) => {
      client.setQueryData(['project', projectId], project);
      await invalidate();
      toast({
        title: t('recorded'),
        description: milestone?.label,
        tone: 'success',
        illustration: 'payment',
      });
      onOpenChange(false);
    },
    onError: (caught) => {
      setError(describeError(caught));
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (record.isPending) return;
    setError(null);
    const problems: Record<string, CheckKey | null> = {
      milestoneId: milestoneId ? null : 'required',
      amountPaise: amountProblem(amount),
      tdsPaise: withTds ? optionalNotNegativeProblem(tds) : null,
      receivedOn: happenedOnProblem(receivedOn),
    };
    const found: Record<string, string> = {};
    for (const [field, key] of Object.entries(problems)) if (key) found[field] = checkT(key);
    setFieldErrors(found);
    if (Object.keys(found).length > 0) return;
    record.mutate();
  };

  const chooseMilestone = (id: string) => {
    const next = milestones.find((candidate) => candidate.id === id);
    setMilestoneId(id);
    if (next) setAmount(toRupees(remaining(next)));
    if (next?.payer === 'bank') setMethod('bank_disbursement');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('recordTitle')}
      autoFocusField
      footer={
        <>
          <Button type="button" variant="quiet" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" pending={record.isPending}>
            {t('recordSubmit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="grid gap-4 pb-2 sm:grid-cols-2">
        <Field label={t('milestone')} className="sm:col-span-2" error={fieldErrors.milestoneId}>
          <Select
            value={milestoneId}
            onValueChange={chooseMilestone}
            options={milestones.map((candidate) => ({
              value: candidate.id,
              label: candidate.label,
              description: t('left', { amount: formatInr(remaining(candidate)) }),
            }))}
          />
        </Field>
        <Field label={t('amount')} required error={fieldErrors.amountPaise}>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            leading={<span className="type-body text-ink-faint">₹</span>}
          />
        </Field>
        <Field label={t('method')} error={fieldErrors.method}>
          <Select
            value={bank ? 'bank_disbursement' : method}
            onValueChange={setMethod}
            disabled={bank}
            options={METHODS.filter((value) => bank || value !== 'bank_disbursement').map(
              (value) => ({ value, label: methodT(value) }),
            )}
          />
        </Field>
        {withTds && (
          <Field
            label={t('tds')}
            hint={
              tdsPaise > 0
                ? t('tdsSettles', { amount: formatInr(paiseOf(amount) + tdsPaise) })
                : t('tdsHint')
            }
            error={fieldErrors.tdsPaise}
            className="sm:col-span-2"
          >
            <Input
              inputMode="decimal"
              value={tds}
              placeholder="0"
              onChange={(event) => setTds(event.target.value)}
              leading={<span className="type-body text-ink-faint">₹</span>}
            />
          </Field>
        )}
        <Field label={t('receivedOn')} required error={fieldErrors.receivedOn}>
          <Input
            type="date"
            max={todayIn()}
            value={receivedOn}
            onChange={(event) => setReceivedOn(event.target.value)}
          />
        </Field>
        <Field label={t('reference')} hint={t('referenceHint')} error={fieldErrors.reference}>
          <Input value={reference} onChange={(event) => setReference(event.target.value)} />
        </Field>
        <CollectedFields
          method={bank ? 'bank_disbursement' : method}
          value={collected}
          onChange={setCollected}
          errors={fieldErrors}
        />
        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md bg-overdue-tint px-3 py-2.5 type-body-sm text-overdue sm:col-span-2"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
