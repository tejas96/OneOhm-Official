'use client';

import type { Payable } from '@oneohm/api-contracts';
import { Button, Field, Sheet, useToast } from '@oneohm/design-system/web';
import { billTds, billToPay, matchVendorInvoice } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useCan } from '@/providers/current-user';
import { NumberInput } from '../../settings/number-input';
import { useInvalidateFinance } from '../use-finance';
import { InvoiceFlag } from './bill-amount';

/**
 * A bill waiting for approval: the vendor's invoice total next to the order amount, the
 * TDS to hold, and what the payee gets. Approving books the cost and the TDS.
 */
export function ReviewBillSheet({
  bill,
  onClose,
}: {
  readonly bill: Payable | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('finance.payables.review');
  const partyT = useTranslations('finance.payables.party');
  const formId = useId();
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const canApprove = useCan('finance.approve_payments');
  const form = useApiForm();
  const [invoicePaise, setInvoicePaise] = useState<number | null>(null);
  const [tdsBp, setTdsBp] = useState<number | null>(null);
  const { reset } = form;

  useEffect(() => {
    setInvoicePaise(bill?.vendorInvoicePaise ?? null);
    setTdsBp(bill && bill.tdsBp > 0 ? bill.tdsBp : null);
    reset();
  }, [bill, reset]);

  const amountPaise = bill?.amountPaise ?? 0;
  const gstPaise = bill?.gstPaise ?? 0;
  const tdsPaise = billTds({ amountPaise, gstPaise, tdsBp: tdsBp ?? 0 });
  const toPay = billToPay({
    amountPaise,
    tdsPaise,
    advanceAdjustedPaise: bill?.advanceAdjustedPaise ?? 0,
  });
  const match = matchVendorInvoice({ expectedPaise: amountPaise, invoicePaise });

  const run = async (approve: boolean) => {
    if (!bill) return;
    const saved = await form.run(async () => {
      const reviewed = await expectStatus(
        api.finance.reviewPayable({
          params: { id: bill.id },
          body: { vendorInvoicePaise: invoicePaise, tdsBp: tdsBp ?? 0 },
        }),
        200,
      );
      if (!approve) return reviewed;
      return expectStatus(api.finance.approvePayable({ params: { id: bill.id } }), 200);
    });
    if (!saved) return;
    await invalidate();
    toast({
      tone: 'success',
      title: approve ? t('approved') : t('saved'),
      description: bill.partyName,
    });
    onClose();
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(canApprove);
  };

  return (
    <Sheet
      open={bill !== null}
      onOpenChange={(next) => !next && onClose()}
      title={t('title')}
      description={bill ? `${bill.partyName} · ${partyT(bill.party)}` : ''}
      footer={
        <>
          {canApprove && (
            <Button type="button" variant="quiet" onClick={() => run(false)}>
              {t('save')}
            </Button>
          )}
          <Button type="submit" form={formId} variant="primary" pending={form.pending}>
            {canApprove ? t('approve') : t('save')}
          </Button>
        </>
      }
    >
      {bill && (
        <form
          id={formId}
          onSubmit={submit}
          noValidate
          className="flex flex-col gap-6 px-5 py-6 sm:px-6"
        >
          <div className="flex flex-col gap-1">
            <p className="type-body text-ink">{bill.description}</p>
            <p className="font-mono type-label text-ink-faint">
              {[bill.projectCode, bill.billNumber].filter(Boolean).join(' · ')}
            </p>
          </div>
          <dl className="flex flex-col gap-2 rounded-2xl bg-sunken px-4 py-3">
            <Row label={t(bill.party === 'vendor' ? 'orderAmount' : 'billAmount')}>
              {formatInr(amountPaise)}
            </Row>
            {gstPaise > 0 && (
              <Row label={t('gstIncluded')} quiet>
                {formatInr(gstPaise)}
              </Row>
            )}
          </dl>
          {bill.party === 'vendor' && (
            <div className="flex flex-col gap-3">
              <Field
                label={t('invoiceAmount')}
                hint={t('invoiceAmountHint')}
                error={form.fieldErrors.vendorInvoicePaise}
              >
                <NumberInput unit="paise" value={invoicePaise} onValueChange={setInvoicePaise} />
              </Field>
              <InvoiceFlag match={match} />
            </div>
          )}
          <Field
            label={t('tds')}
            hint={gstPaise > 0 ? t('tdsHintGst') : t('tdsHint')}
            error={form.fieldErrors.tdsBp}
          >
            <NumberInput unit="basisPoints" value={tdsBp} onValueChange={setTdsBp} />
          </Field>
          <dl className="flex flex-col gap-2 border-t border-hairline pt-4">
            {tdsPaise > 0 && <Row label={t('tdsHeld')}>{formatInr(tdsPaise)}</Row>}
            {bill.advanceAdjustedPaise > 0 && (
              <Row label={t('advanceUsed')}>{formatInr(bill.advanceAdjustedPaise)}</Row>
            )}
            <Row label={t('toPay')} strong>
              {formatInr(toPay)}
            </Row>
          </dl>
          <FormError message={form.error} />
        </form>
      )}
    </Sheet>
  );
}

function Row({
  label,
  children,
  quiet = false,
  strong = false,
}: {
  readonly label: string;
  readonly children: string;
  readonly quiet?: boolean;
  readonly strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={quiet ? 'type-body-sm text-ink-faint' : 'type-body-sm text-ink-muted'}>
        {label}
      </dt>
      <dd
        className={`font-mono tabular-nums ${strong ? 'type-title-md text-ink' : quiet ? 'type-body-sm text-ink-faint' : 'type-body text-ink'}`}
      >
        {children}
      </dd>
    </div>
  );
}
