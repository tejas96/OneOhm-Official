'use client';

import { Field, Input, Select } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { useDebouncedValue } from '@/lib/use-debounced-value';

export interface SiteChoice {
  readonly propertyId: string;
  readonly projectId: string | null;
}

const NONE = 'none';

/** Find the customer, then the site, and optionally the project the request belongs to. */
export function SitePicker({
  value,
  onChange,
  error,
}: {
  readonly value: SiteChoice | null;
  readonly onChange: (value: SiteChoice | null) => void;
  readonly error: string | undefined;
}) {
  const t = useTranslations('discom.raise');
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState<string>('');
  const term = useDebouncedValue(search.trim(), 300);
  const customers = useQuery({
    queryKey: ['customers', 'list', term],
    queryFn: () =>
      expectStatus(api.crm.listCustomers({ query: term ? { search: term } : {} }), 200),
  });
  const customer = useQuery({
    queryKey: ['customers', 'detail', customerId],
    queryFn: () => expectStatus(api.crm.getCustomer({ params: { id: customerId } }), 200),
    enabled: Boolean(customerId),
  });
  const properties = customer.data?.properties ?? [];
  const projects = customer.data?.projects ?? [];

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-hairline p-4">
      <Field label={t('findCustomer')}>
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('searchCustomer')}
          leading={<Search aria-hidden className="size-4" />}
        />
      </Field>
      <Field label={t('customer')}>
        <Select
          value={customerId || undefined}
          onValueChange={(id) => {
            setCustomerId(id);
            onChange(null);
          }}
          placeholder={t('pickCustomer')}
          options={(customers.data ?? [])
            .slice(0, 30)
            .map((row) => ({ value: row.id, label: row.name }))}
        />
      </Field>
      {customerId && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('site')} error={error}>
            <Select
              value={value?.propertyId}
              onValueChange={(propertyId) =>
                onChange({ propertyId, projectId: value?.projectId ?? null })
              }
              placeholder={t('pickSite')}
              options={properties.map((property) => ({
                value: property.id,
                label: property.label,
                description: `${property.addressLine}, ${property.city}`,
              }))}
            />
          </Field>
          <Field label={t('project')} hint={t('projectHint')}>
            <Select
              value={value?.projectId ?? NONE}
              disabled={!value}
              onValueChange={(projectId) =>
                value && onChange({ ...value, projectId: projectId === NONE ? null : projectId })
              }
              options={[
                { value: NONE, label: t('noProject') },
                ...projects.map((project) => ({
                  value: project.id,
                  label: `${project.code} · ${project.name}`,
                })),
              ]}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
