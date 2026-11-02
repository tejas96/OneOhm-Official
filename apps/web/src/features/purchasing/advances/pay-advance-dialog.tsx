'use client';

import type { VendorAdvance } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, Select, useToast } from '@oneohm/design-system/web';
import { formatInr, todayIn } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useRefreshPurchasing } from '../use-purchasing';

const METHODS = ['bank_transfer', 'upi', 'cheque', 'cash'] as const;
type Method = (typeof METHODS)[number];

/** Pays an approved advance; it is set against any approved bill on the order. */
export function PayAdvanceDialog({
  advance,
  onClose,
}: {
  readonly advance: VendorAdvance | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('purchasing.advances.pay');
  const methodT = useTranslations('finance.methods');
  const formId = useId();
  const toast = useToast();
  const refresh = useRefreshPurchasing();
  const form = useApiForm();
  const [method, setMethod] = useState<Method>('bank_transfer');
  const [paidOn, setPaidOn] = useState(todayIn());
  const [reference, setReference] = useState('');

  const close = () => {
    setReference('');
    setPaidOn(todayIn());
    form.reset();
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!advance) return;
    await form.run(
      () =>
        expectStatus(
          api.purchasing.advances.pay({
            params: { id: advance.id },
            body: { method, paidOn, reference },
          }),
          200,
        ),
      async (paid) => {
        await refresh();
        toast({
          tone: 'success',
          title: t('done', { number: paid.number }),
          description: paid.vendor.name,
        });
        close();
      },
    );
  };

  return (
    <Dialog
      open={advance !== null}
      onOpenChange={(open) => !open && close()}
      title={t('title')}
      description={
        advance
          ? t('description', {
              amount: formatInr(advance.amountPaise),
              vendor: advance.vendor.name,
              order: advance.purchaseOrder.number,
            })
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
        <Field label={t('method')} error={form.fieldErrors.method}>
          <Select
            value={method}
            onValueChange={setMethod}
            options={METHODS.map((value) => ({ value, label: methodT(value) }))}
          />
        </Field>
        <Field label={t('paidOn')} required error={form.fieldErrors.paidOn}>
          <Input
            type="date"
            value={paidOn}
            max={todayIn()}
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
    </Dialog>
  );
}
