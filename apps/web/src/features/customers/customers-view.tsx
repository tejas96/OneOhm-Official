'use client';

import type { Customer } from '@oneohm/api-contracts';
import {
  Avatar,
  Badge,
  EmptyState,
  Input,
  PageHeader,
  pageEnter,
  ResponsiveTable,
  type TableColumn,
} from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { formatPhone, swatchFor } from '@/lib/format/contact';
import { useDebouncedValue } from '@/lib/use-debounced-value';

/** Every customer once, however many sites and projects they have (PRD 3.2). */
export function CustomersView() {
  const t = useTranslations('customers');
  const format = useFormatter();
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim());
  const query = useQuery({
    queryKey: ['customers', 'list', term],
    queryFn: () =>
      expectStatus(api.crm.listCustomers({ query: term ? { search: term } : {} }), 200),
    placeholderData: (previous) => previous,
  });
  const rows = query.data ?? [];

  const columns: TableColumn<Customer>[] = [
    {
      key: 'name',
      header: t('columns.customer'),
      primary: true,
      cell: (customer) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={customer.name} swatch={swatchFor(customer.id)} size="sm" />
          <span className="flex min-w-0 flex-col">
            <Link
              href={`/customers/${customer.id}`}
              className="oh-stretched-link truncate type-title-md text-ink [font-family:var(--font-display)] hover:text-accent"
            >
              {customer.name}
            </Link>
            <span className="font-mono text-[0.75rem] text-ink-faint">
              {formatPhone(customer.phone)}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'kind',
      header: t('columns.kind'),
      cell: (customer) => <Badge variant="soft">{t(`kind.${customer.kind}`)}</Badge>,
    },
    {
      key: 'properties',
      header: t('columns.properties'),
      align: 'end',
      cell: (customer) => <span className="font-mono">{customer.propertyCount}</span>,
    },
    {
      key: 'projects',
      header: t('columns.projects'),
      align: 'end',
      cell: (customer) => <span className="font-mono">{customer.projectCount}</span>,
    },
    {
      key: 'since',
      header: t('columns.since'),
      hideOnPhone: true,
      align: 'end',
      cell: (customer) => (
        <span className="type-body-sm text-ink-muted">
          {format.dateTime(new Date(customer.createdAt), {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      ),
    },
  ];

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8">
      <PageHeader
        eyebrow={
          <span className="font-mono text-[0.75rem] tracking-wide uppercase">{t('eyebrow')}</span>
        }
        title={t('title')}
        description={t('description')}
        actions={
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchLabel')}
            leading={<Search />}
            className="sm:w-80"
          />
        }
      />
      {query.isPending ? (
        <ListSkeleton label={t('loading')} />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={term ? t('empty.searchTitle') : t('empty.title')}
          description={term ? t('empty.searchBody', { term }) : t('empty.body')}
        />
      ) : (
        <ResponsiveTable
          caption={t('title')}
          columns={columns}
          rows={rows}
          rowKey={(customer) => customer.id}
        />
      )}
    </motion.div>
  );
}
