'use client';

import type { ProjectLoan } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, Select, useToast } from '@oneohm/design-system/web';
import { formatInr, todayIn } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { NumberInput } from '../../settings/number-input';
import { useInvalidateFinance } from '../use-finance';

const UNPLANNED = 'unplanned';

/** Money from the bank: recorded against the project's bank milestone, with its tranche. */
export function DisbursementDialog({
  loan,
  onClose,
}: {
  readonly loan: ProjectLoan | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('finance.loans.disbursement');
  const formId = useId();
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const form = useApiForm();
  const open = (loan?.tranches ?? []).filter((tranche) => tranche.status !== 'received');
  const remaining = loan ? loan.bankSharePaise - loan.receivedPaise : 0;
  const [trancheId, setTrancheId] = useState(UNPLANNED);
  const [amount, setAmount] = useState<number | null>(null);
  const [receivedOn, setReceivedOn] = useState(todayIn());
  const [reference, setReference] = useState('');

  useEffect(() => {
    const first = (loan?.tranches ?? []).find((tranche) => tranche.status !== 'received');
    setTrancheId(first?.id ?? UNPLANNED);
    setAmount(first?.amountPaise ?? (loan ? loan.bankSharePaise - loan.receivedPaise : null));
    setReceivedOn(todayIn());
    setReference('');
  }, [loan]);

  const pick = (id: string) => {
    setTrancheId(id);
    const tranche = open.find((entry) => entry.id === id);
    setAmount(tranche?.amountPaise ?? remaining);
  };

  const close = () => {
    form.reset();
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loan) return;
    const saved = await form.run(() =>
      expectStatus(
        api.finance.recordDisbursement({
          params: { projectId: loan.projectId },
          body: {
            trancheId: trancheId === UNPLANNED ? null : trancheId,
            amountPaise: amount ?? 0,
            receivedOn,
            reference: reference.trim() || null,
          },
        }),
        201,
      ),
    );
    if (!saved) return;
    await invalidate();
    toast({ title: t('done'), description: saved.projectCode, tone: 'success' });
    close();
  };

  return (
    <Dialog
      open={loan !== null}
      onOpenChange={(next) => !next && close()}
      title={t('title')}
      description={
        loan
          ? t('description', { lender: loan.lenderName, remaining: formatInr(remaining) })
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
        {open.length > 0 && (
          <Field label={t('tranche')} className="sm:col-span-2">
            <Select
              value={trancheId}
              onValueChange={pick}
              options={[
                ...open.map((tranche) => ({
                  value: tranche.id,
                  label: tranche.label,
                  description: formatInr(tranche.amountPaise),
                })),
                { value: UNPLANNED, label: t('unplanned') },
              ]}
            />
          </Field>
        )}
        <Field label={t('amount')} required error={form.fieldErrors.amountPaise}>
          <NumberInput unit="paise" value={amount} onValueChange={setAmount} />
        </Field>
        <Field label={t('receivedOn')} required error={form.fieldErrors.receivedOn}>
          <Input
            type="date"
            value={receivedOn}
            onChange={(event) => setReceivedOn(event.target.value)}
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
    </Dialog>
  );
}
