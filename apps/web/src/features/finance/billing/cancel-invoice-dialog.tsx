'use client';

import type { TaxInvoice } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Textarea, useToast } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useInvalidateFinance } from '../use-finance';

/** An issued invoice is never edited: it is cancelled with a reason, then issued again. */
export function CancelInvoiceDialog({
  invoice,
  onClose,
}: {
  readonly invoice: TaxInvoice | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('finance.billing.cancelDialog');
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
    if (!invoice) return;
    const done = await form.run(() =>
      expectStatus(
        api.billing.cancelInvoice({ params: { id: invoice.id }, body: { reason: reason.trim() } }),
        200,
      ),
    );
    if (!done) return;
    await invalidate();
    toast({ title: t('done'), description: done.number, tone: 'success' });
    close();
  };

  return (
    <Dialog
      open={invoice !== null}
      onOpenChange={(open) => !open && close()}
      title={t('title')}
      description={invoice ? t('description', { number: invoice.number }) : undefined}
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
