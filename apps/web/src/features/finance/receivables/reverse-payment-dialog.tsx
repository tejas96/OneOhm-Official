'use client';

import type { ReceivedPayment } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Textarea, useToast } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useInvalidateFinance } from '../use-finance';

/**
 * Reverses a payment recorded by mistake: the original stays, a reversal row and a
 * reversing journal entry are added, and the milestone reopens.
 */
export function ReversePaymentDialog({
  payment,
  onClose,
}: {
  readonly payment: ReceivedPayment | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('finance.payments.reverseDialog');
  const formId = useId();
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const form = useApiForm();
  const [reason, setReason] = useState('');

  const close = () => {
    setReason('');
    form.reset();
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!payment) return;
    const done = await form.run(() =>
      expectStatus(
        api.finance.reversePayment({ params: { id: payment.id }, body: { reason: reason.trim() } }),
        201,
      ),
    );
    if (!done) return;
    await invalidate();
    toast({ title: t('done'), description: payment.receiptNumber ?? undefined, tone: 'success' });
    close();
  };

  return (
    <Dialog
      open={payment !== null}
      onOpenChange={(open) => !open && close()}
      title={t('title')}
      description={
        payment
          ? t('description', {
              amount: formatInr(payment.amountPaise),
              customer: payment.customerName,
            })
          : undefined
      }
      autoFocusField
      footer={
        <>
          <Button type="button" variant="quiet" onClick={close}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} variant="danger" pending={form.pending}>
            {t('submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={t('reason')} hint={t('reasonHint')} required error={form.fieldErrors.reason}>
          <Textarea value={reason} rows={3} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
