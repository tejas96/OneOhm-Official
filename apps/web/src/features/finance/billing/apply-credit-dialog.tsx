'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, Select, useToast } from '@oneohm/design-system/web';
import { formatInr, rupeesToPaise } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useInvalidateFinance } from '../use-finance';

type Milestone = ProjectDetail['milestones'][number];
const left = (milestone: Milestone) => milestone.amountPaise - milestone.paidPaise;

/** Pays a customer milestone out of their credit; it gets a receipt like any payment. */
export function ApplyCreditDialog({
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
  const t = useTranslations('finance.billing.applyDialog');
  const formId = useId();
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const form = useApiForm();
  const unpaid = milestones.filter((m) => m.payer === 'customer' && left(m) > 0);
  const first = unpaid[0];
  const suggest = (milestone: Milestone | undefined) =>
    milestone ? String(Math.min(creditPaise, left(milestone)) / 100) : '';
  const [milestoneId, setMilestoneId] = useState(first?.id ?? '');
  const [amount, setAmount] = useState(suggest(first));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const done = await form.run(() =>
      expectStatus(
        api.billing.applyCredit({
          params: { projectId },
          body: { milestoneId, amountPaise: rupeesToPaise(Number(amount.replace(/,/g, ''))) },
        }),
        201,
      ),
    );
    if (!done) return;
    await invalidate();
    toast({ title: t('done'), description: done.milestoneLabel ?? undefined, tone: 'success' });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('title')}
      description={t('description', { amount: formatInr(creditPaise) })}
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
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={t('milestone')} error={form.fieldErrors.milestoneId}>
          <Select
            value={milestoneId}
            onValueChange={(id) => {
              setMilestoneId(id);
              setAmount(suggest(unpaid.find((m) => m.id === id)));
            }}
            options={unpaid.map((m) => ({
              value: m.id,
              label: m.label,
              description: t('left', { amount: formatInr(left(m)) }),
            }))}
          />
        </Field>
        <Field label={t('amount')} required error={form.fieldErrors.amountPaise}>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            leading={<span className="type-body text-ink-faint">₹</span>}
          />
        </Field>
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
