'use client';

import type { PayablePayment } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Textarea, useToast } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { ApiError, describeError } from '@/lib/api/api-error';
import { checkText } from './text-check';
import { useUndoPayment } from './use-bill-payments';

const REASON_MIN = 5;
const REASON_MAX = 500;

/**
 * Asks "undo this payment?" with a reason. Nothing is deleted: the payment is marked undone
 * and the bill gets the money back as owed.
 */
export function UndoPaymentDialog({
  billId,
  payment,
  onClose,
}: {
  readonly billId: string;
  readonly payment: PayablePayment | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('finance.payables.payments.undo');
  const formId = useId();
  const toast = useToast();
  const undo = useUndoPayment();
  const [reason, setReason] = useState('');

  // Shown while typing; the button waits for a reason of 5 to 500 characters.
  const check = checkText(reason, REASON_MIN, REASON_MAX);
  const problem =
    check.problem === 'short'
      ? t('reasonShort', { min: REASON_MIN })
      : check.problem === 'long'
        ? t('reasonLong', { max: REASON_MAX })
        : null;
  // A field error from the server goes next to the box; anything else under it.
  const fault = undo.error instanceof ApiError ? (undo.error.fieldErrors.reason ?? null) : null;
  const ready = check.length >= REASON_MIN && check.problem === null;

  const close = () => {
    setReason('');
    undo.reset();
    onClose();
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!payment || undo.isPending) return;
    if (check.problem !== null || reason.trim() === '') return;
    undo.mutate(
      { billId, paymentId: payment.id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast({ tone: 'success', title: t('done') });
          close();
        },
      },
    );
  };

  return (
    <Dialog
      open={payment !== null}
      onOpenChange={(open) => !open && close()}
      title={t('title')}
      description={payment ? t('question', { amount: formatInr(payment.amountPaise) }) : undefined}
      autoFocusField
      footer={
        <>
          <Button type="button" variant="quiet" disabled={undo.isPending} onClick={close}>
            {t('keep')}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="danger"
            pending={undo.isPending}
            disabled={!ready}
          >
            {t('submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field
          label={t('reason')}
          hint={
            check.showCounter
              ? t('reasonCount', { used: check.length, max: REASON_MAX })
              : t('reasonHint')
          }
          required
          error={problem ?? fault}
        >
          <Textarea
            value={reason}
            rows={3}
            onChange={(event) => {
              setReason(event.target.value);
              undo.reset();
            }}
          />
        </Field>
        <FormError message={undo.isError && fault === null ? describeError(undo.error) : null} />
      </form>
    </Dialog>
  );
}
