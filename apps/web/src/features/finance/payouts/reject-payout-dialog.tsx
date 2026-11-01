'use client';

import { Button, Dialog, Field, Textarea, useToast } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useInvalidateFinance } from '../use-finance';
import { type PayoutTarget, rejectPayout } from './use-payouts';

/** Turns down an earned commission or reward, with the reason the person is told. */
export function RejectPayoutDialog({
  target,
  onClose,
}: {
  readonly target: PayoutTarget | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('finance.payouts.rejectDialog');
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
    if (!target) return;
    const done = await form.run(() => rejectPayout(target, reason.trim()));
    if (!done) return;
    await invalidate();
    toast({ title: t('done'), description: target.party, tone: 'success' });
    close();
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
        <Button type="submit" form={formId} variant="danger" pending={form.pending}>
          {t('submit')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={t('reason')} hint={t('reasonHint')} required error={form.fieldErrors.reason}>
          <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
