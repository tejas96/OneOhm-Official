'use client';

import type { LeadDetail } from '@oneohm/api-contracts';
import { Button, Card } from '@oneohm/design-system/web';
import { ArrowRight, FilePlus2, UserRoundCheck, UserRoundPlus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCan } from '@/providers/current-user';
import { ConvertLeadDialog } from './convert-lead-dialog';

/** The step from lead to customer: convert with the site details, then quote. */
export function LeadCustomerCard({ lead }: { readonly lead: LeadDetail }) {
  const t = useTranslations('leads.customerCard');
  const canConvert = useCan('customers.manage', 'quotations.create');
  const canQuote = useCan('quotations.create');
  const [converting, setConverting] = useState(false);

  if (lead.customerId) {
    return (
      <Card className="oh-panel flex flex-col gap-4 rounded-[28px] border-0 p-5 shadow-e3">
        <span className="flex size-10 items-center justify-center rounded-full bg-on-panel/12 text-on-panel">
          <UserRoundCheck aria-hidden className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="type-title-md text-on-panel">{t('convertedTitle')}</h2>
          <p className="type-body-sm text-on-panel-muted">{t('convertedBody')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canQuote && lead.propertyId && (
            <Button asChild variant="panel" size="sm" leadingIcon={<FilePlus2 />}>
              <Link href={`/quotations/new?propertyId=${lead.propertyId}&leadId=${lead.id}`}>
                {t('createQuotation')}
              </Link>
            </Button>
          )}
          <Button asChild variant="panelQuiet" size="sm" trailingIcon={<ArrowRight />}>
            <Link href={`/customers/${lead.customerId}`}>{t('openCustomer')}</Link>
          </Button>
        </div>
      </Card>
    );
  }

  if (!canConvert || lead.stage === 'lost') return null;
  return (
    <Card className="flex flex-col gap-4 rounded-[28px] border-dashed p-5">
      <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
        <UserRoundPlus aria-hidden className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="type-title-md text-ink">{t('title')}</h2>
        <p className="type-body-sm text-ink-muted">{t('body')}</p>
      </div>
      <Button
        variant="primary"
        size="sm"
        onClick={() => setConverting(true)}
        className="self-start"
      >
        {t('convert')}
      </Button>
      <ConvertLeadDialog lead={lead} open={converting} onOpenChange={setConverting} />
    </Card>
  );
}
