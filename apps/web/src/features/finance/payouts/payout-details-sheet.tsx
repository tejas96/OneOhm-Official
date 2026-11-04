'use client';

import type { PayoutDetailsView } from '@oneohm/api-contracts';
import { Button, Sheet, useToast } from '@oneohm/design-system/web';
import { type PayoutField, payoutFieldsFor } from '@oneohm/domain';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useInvalidateFinance } from '../use-finance';
import { PayoutDetailsForm } from './payout-details-form';
import { type PayoutParty, payoutKeys, usePayoutDetails } from './use-payouts';

/**
 * Finance's view of one reseller's payout details (left the team or not): the saved values
 * with Change, or the form straight away while they are incomplete.
 */
export function PayoutDetailsSheet({
  party,
  onClose,
}: {
  readonly party: PayoutParty | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('finance.payouts.detailsPanel');
  const formId = useId();
  const form = useApiForm();
  const toast = useToast();
  const client = useQueryClient();
  const invalidate = useInvalidateFinance();
  const query = usePayoutDetails(party?.id ?? null);
  const [changing, setChanging] = useState(false);
  const details = query.data ?? null;
  const editing = changing || details?.complete === false;

  const close = () => {
    setChanging(false);
    form.reset();
    onClose();
  };

  const onSaved = async (saved: PayoutDetailsView) => {
    if (!party) return;
    client.setQueryData(payoutKeys.details(party.id), saved);
    // The commission list's "ready to pay" flags change with these details.
    await invalidate();
    toast({ title: t('saved'), description: party.fullName, tone: 'success' });
    // Closed like the other sheets: left open, the toast would take the next Esc.
    close();
  };

  return (
    <Sheet
      open={party !== null}
      onOpenChange={(open) => !open && close()}
      title={t('title')}
      description={party ? t('description', { party: party.fullName }) : undefined}
      footer={
        details &&
        (editing ? (
          // Keyed apart: reused in place, the clicked Change would turn into Save and submit.
          <Button key="save" type="submit" form={formId} variant="primary" pending={form.pending}>
            {t('save')}
          </Button>
        ) : (
          <Button
            key="change"
            variant="secondary"
            leadingIcon={<Pencil />}
            onClick={() => setChanging(true)}
          >
            {t('change')}
          </Button>
        ))
      }
    >
      <div className="flex flex-col gap-5 px-5 py-5 sm:px-6">
        {query.isPending && <ListSkeleton label={t('loading')} />}
        {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
        {details && !details.complete && (
          <p className="flex items-start gap-2 rounded-md bg-at-risk-tint px-3 py-2.5 type-body-sm text-at-risk">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t('incomplete')}
          </p>
        )}
        {details && party && editing && (
          <PayoutDetailsForm
            key={details.complete ? 'change' : 'add'}
            formId={formId}
            resellerId={party.id}
            saved={details}
            form={form}
            onSaved={onSaved}
          />
        )}
        {details && !editing && <SavedDetails details={details} />}
      </div>
    </Sheet>
  );
}

/** The saved way to pay and PAN, as a short list. */
function SavedDetails({ details }: { readonly details: PayoutDetailsView }) {
  const t = useTranslations('finance.payouts.detailsPanel');
  const fields: readonly PayoutField[] = payoutFieldsFor(details.upiId ? 'upi' : 'bank');
  return (
    <dl className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <dt className="type-label text-ink-faint">{t('methodLabel')}</dt>
        <dd className="type-body text-ink">{t(`methods.${details.upiId ? 'upi' : 'bank'}`)}</dd>
      </div>
      {fields.map((field) => (
        <div key={field} className="flex flex-col gap-1">
          <dt className="type-label text-ink-faint">{t(`fields.${field}`)}</dt>
          <dd
            className={
              field === 'bankAccountName' ? 'type-body text-ink' : 'font-mono type-body text-ink'
            }
          >
            {details[field]}
          </dd>
        </div>
      ))}
    </dl>
  );
}
