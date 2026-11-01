'use client';

import type { LeadDetail, Property } from '@oneohm/api-contracts';
import { Field, SegmentedControl, Select } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { UserRoundCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCan } from '@/providers/current-user';

export const NEW_SITE = 'new';

/** The sites of the customer already on this lead's phone, when there is one. */
export function useMatchedSites(lead: LeadDetail, open: boolean): readonly Property[] {
  const canView = useCan('customers.view');
  const customerId = lead.matchedCustomer?.id;
  const customer = useQuery({
    queryKey: ['customers', 'detail', customerId],
    queryFn: () => expectStatus(api.crm.getCustomer({ params: { id: customerId ?? '' } }), 200),
    enabled: open && canView && Boolean(customerId),
  });
  return customer.data?.properties ?? [];
}

/**
 * The lead's phone already belongs to a customer (PRD 3.3: matching): say so, and offer
 * that customer's sites so a new one is not typed twice.
 */
export function ExistingSitePicker({
  lead,
  sites,
  value,
  onValueChange,
}: {
  readonly lead: LeadDetail;
  readonly sites: readonly Property[];
  readonly value: string;
  readonly onValueChange: (value: string) => void;
}) {
  const t = useTranslations('leads.convert');
  if (!lead.matchedCustomer) return null;
  const onFile = value !== NEW_SITE;
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-sunken/70 px-4 py-3.5">
      <p className="flex items-start gap-2 type-body-sm text-ink-muted">
        <UserRoundCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
        <span>
          {t.rich('alreadyCustomer', {
            name: lead.matchedCustomer.name,
            link: (chunks) => (
              <Link
                href={`/customers/${lead.matchedCustomer?.id}`}
                className="font-medium text-ink underline underline-offset-4 hover:text-accent"
              >
                {chunks}
              </Link>
            ),
          })}
        </span>
      </p>
      {sites.length > 0 && (
        <>
          <SegmentedControl
            label={t('siteChoice')}
            size="sm"
            value={onFile ? 'existing' : NEW_SITE}
            onValueChange={(next) =>
              onValueChange(next === NEW_SITE ? NEW_SITE : (sites[0]?.id ?? NEW_SITE))
            }
            options={[
              { value: 'existing', label: t('siteExisting') },
              { value: NEW_SITE, label: t('siteNew') },
            ]}
            className="self-start"
          />
          {onFile && (
            <Field label={t('site')}>
              <Select
                value={value}
                onValueChange={onValueChange}
                options={sites.map((site) => ({
                  value: site.id,
                  label: site.label,
                  description: `${site.addressLine}, ${site.city}`,
                }))}
              />
            </Field>
          )}
        </>
      )}
    </div>
  );
}
