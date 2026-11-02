'use client';

import type { InvoiceDraft } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, useToast } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useInvalidateFinance } from '../use-finance';

/**
 * Issues the project's tax invoice. It is fixed from then on, so the dialog says what
 * will be printed and asks for the customer's GSTIN when they have one.
 */
export function IssueInvoiceDialog({
  projectId,
  customerName,
  draft,
  open,
  onClose,
}: {
  readonly projectId: string;
  readonly customerName: string;
  readonly draft: InvoiceDraft;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const t = useTranslations('finance.billing.issueDialog');
  const supplyT = useTranslations('finance.billing.supply');
  const formId = useId();
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const form = useApiForm();
  const [gstin, setGstin] = useState(draft.customerGstin ?? '');

  const close = () => {
    form.reset();
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const typed = gstin.trim();
    await form.run(
      () =>
        expectStatus(
          api.billing.issueInvoice({
            params: { projectId },
            body: { customerGstin: typed === '' ? null : typed },
          }),
          201,
        ),
      async (issued) => {
        await invalidate();
        toast({ title: t('done'), description: issued.number, tone: 'success' });
        close();
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title={t('title')}
      description={t('description', { total: formatInr(draft.totalPaise), customer: customerName })}
      autoFocusField
      footer={
        <>
          <Button type="button" variant="quiet" onClick={close}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" pending={form.pending}>
            {t('submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <dl className="flex flex-col gap-1 rounded-lg bg-sunken/70 px-4 py-3 type-body-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">{t('placeOfSupply')}</dt>
            <dd className="text-right text-ink">{draft.placeOfSupply}</dd>
          </div>
          {draft.supply && (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">{t('tax')}</dt>
              <dd className="text-right text-ink">{supplyT(draft.supply)}</dd>
            </div>
          )}
        </dl>
        <Field label={t('gstin')} hint={t('gstinHint')} error={form.fieldErrors.customerGstin}>
          <Input
            value={gstin}
            maxLength={20}
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono uppercase"
            onChange={(event) => setGstin(event.target.value)}
          />
        </Field>
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
