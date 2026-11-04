'use client';

import type { Customer, CustomerPage } from '@oneohm/api-contracts';
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Input,
  PageHeader,
  pageEnter,
  ResponsiveTable,
  type TableColumn,
} from '@oneohm/design-system/web';
import { Search, Users } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { LoadMore } from '@/components/load-more';
import { BlockedPage, ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { formatPhone, swatchFor } from '@/lib/format/contact';
import { usePagedList } from '@/lib/query/use-paged-list';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useCan } from '@/providers/current-user';
import { HandoverList } from './contact/handover-list';
import { useHandovers } from './contact/use-contact';

/** Every customer once, however many sites and projects they have (PRD 3.2). */
export function CustomersView() {
  const t = useTranslations('customers');
  if (!useCan('customers.view')) return <BlockedPage title={t('title')} />;
  return <CustomersContent />;
}

function CustomersContent() {
  const t = useTranslations('customers');
  const format = useFormatter();
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim());
  // The API finds and pages them (PRD 9.3); more load as the person scrolls.
  const list = usePagedList<Customer, CustomerPage>(['customers', 'page', term], (cursor) =>
    expectStatus(
      api.lists.customers({
        query: { limit: 30, ...(term ? { q: term } : {}), ...(cursor ? { cursor } : {}) },
      }),
      200,
    ),
  );
  const { query, items: rows } = list;

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
      <ShareInPerson />
      {query.isPending ? (
        <ListSkeleton label={t('loading')} />
      ) : query.isError && rows.length === 0 ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={term ? t('empty.searchTitle') : t('empty.title')}
          description={term ? t('empty.searchBody', { term }) : t('empty.body')}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <ResponsiveTable
            caption={t('title')}
            columns={columns}
            rows={rows}
            rowKey={(customer) => customer.id}
          />
          <LoadMore
            shown={rows.length}
            total={list.total}
            hasMore={list.hasMore}
            loading={list.loadingMore}
            onMore={list.loadMore}
          />
        </div>
      )}
    </motion.div>
  );
}

/** News for customers on neither WhatsApp nor SMS, waiting to be shared in person. */
function ShareInPerson() {
  const t = useTranslations('customers.handovers');
  const handovers = useHandovers();
  if (!handovers.data || handovers.data.length === 0) return null;
  return (
    <Card>
      <CardHeader title={t('title', { count: handovers.data.length })} description={t('intro')} />
      <div className="px-5 pb-3">
        <HandoverList items={handovers.data} showCustomer />
      </div>
    </Card>
  );
}
