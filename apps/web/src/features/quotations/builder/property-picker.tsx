'use client';

import type { Customer, Property } from '@oneohm/api-contracts';
import { Button, cn, Input, Skeleton } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Home, Search } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { useDebouncedValue } from '../use-debounced-value';
import { PropertySummary } from './property-summary';

/**
 * Who the quotation is for. Opened from a lead or customer, the property is already
 * known; otherwise sales finds the customer by name or phone and picks the site.
 */
export function PropertyPicker({
  propertyId,
  onSelect,
  onClear,
}: {
  readonly propertyId: string | null;
  readonly onSelect: (property: Property) => void;
  readonly onClear: () => void;
}) {
  if (propertyId) return <PropertySummary propertyId={propertyId} onChange={onClear} />;
  return <CustomerSearch onSelect={onSelect} />;
}

function CustomerSearch({ onSelect }: { readonly onSelect: (property: Property) => void }) {
  const t = useTranslations('quotations.builder.customer');
  const [term, setTerm] = useState('');
  const search = useDebouncedValue(term.trim(), 250);
  const [openId, setOpenId] = useState<string | null>(null);
  const customers = useQuery({
    queryKey: ['customers', { search }],
    queryFn: () => expectStatus(api.crm.listCustomers({ query: search ? { search } : {} }), 200),
  });
  const list = customers.data ?? [];
  return (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={t('searchPlaceholder')}
        aria-label={t('search')}
        leading={<Search />}
      />
      {customers.isPending ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-rule px-4 py-5 type-body-sm text-ink-muted">
          {t('none')}{' '}
          <Link href="/leads" className="font-medium text-accent hover:underline">
            {t('fromLead')}
          </Link>
        </p>
      ) : (
        <ul className="flex max-h-[22rem] flex-col divide-y divide-hairline overflow-y-auto rounded-xl border border-hairline bg-raised">
          {list.slice(0, 30).map((customer) => (
            <CustomerRow
              key={customer.id}
              customer={customer}
              open={openId === customer.id}
              onToggle={() => setOpenId(openId === customer.id ? null : customer.id)}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CustomerRow({
  customer,
  open,
  onToggle,
  onSelect,
}: {
  readonly customer: Customer;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onSelect: (property: Property) => void;
}) {
  const t = useTranslations('quotations.builder.customer');
  const detail = useQuery({
    queryKey: ['customer', customer.id],
    queryFn: () => expectStatus(api.crm.getCustomer({ params: { id: customer.id } }), 200),
    enabled: open,
  });
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate type-body font-medium text-ink">{customer.name}</span>
          <span className="type-label text-ink-faint">
            {customer.phone} · {t('sites', { count: customer.propertyCount })}
          </span>
        </span>
        <ChevronRight
          aria-hidden
          className={cn('size-4 text-ink-faint transition-transform', open && 'rotate-90')}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-2 bg-surface/60 px-4 pt-1 pb-4">
          {detail.isPending && <Skeleton className="h-14 w-full rounded-lg" />}
          {detail.data?.properties.length === 0 && (
            <p className="type-body-sm text-ink-muted">{t('noSites')}</p>
          )}
          {detail.data?.properties.map((property) => (
            <Button
              key={property.id}
              variant="secondary"
              className="h-auto justify-start py-3 text-left"
              leadingIcon={<Home />}
              onClick={() => onSelect(property)}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate type-body text-ink">{property.label}</span>
                <span className="truncate type-label font-normal text-ink-faint">
                  {property.addressLine}, {property.city}
                </span>
              </span>
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}
