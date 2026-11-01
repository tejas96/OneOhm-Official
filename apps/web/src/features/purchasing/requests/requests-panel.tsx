'use client';

import { Button, EmptyState, Input, Select } from '@oneohm/design-system/web';
import { ClipboardPlus, Inbox, Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useCurrentUser } from '@/providers/current-user';
import { useRequests } from '../use-purchasing';
import { OrderRequestSheet } from './order-request-sheet';
import {
  applyFilters,
  type RequestFilters,
  readFilters,
  SCOPE_FILTERS,
  STATUS_FILTERS,
} from './request-filters';
import { RequestFormSheet } from './request-form-sheet';
import { RequestSheet } from './request-sheet';
import { RequestsTable } from './requests-table';

/**
 * Purchase requests (PRD 3.10). Filters, the open request (`?request=`), a new one
 * (`?raise=1`, with `&projectId=` from a project) and ordering (`?order-request=`)
 * all live in the address.
 */
export function RequestsPanel() {
  const t = useTranslations('purchasing.requests');
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = readFilters(params);
  const [search, setSearch] = useState(filters.search);
  const requests = useRequests();

  const navigate = useCallback(
    (change: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params);
      change(next);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );
  const setFilter = useCallback(
    (patch: Partial<RequestFilters>) =>
      navigate((next) => {
        if (patch.status) next.set('status', patch.status);
        if (patch.scope) next.set('scope', patch.scope);
        if (patch.search !== undefined) {
          if (patch.search) next.set('q', patch.search);
          else next.delete('q');
        }
      }),
    [navigate],
  );
  const setParam = (key: string, value: string | null) =>
    navigate((next) => {
      if (value) next.set(key, value);
      else next.delete(key);
      if (key === 'raise' && !value) next.delete('projectId');
    });

  useEffect(() => {
    if (search.trim() === filters.search) return;
    const timer = window.setTimeout(() => setFilter({ search: search.trim() }), 300);
    return () => window.clearTimeout(timer);
  }, [search, filters.search, setFilter]);

  const rows = requests.data ? applyFilters(requests.data, filters, user.id) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1 lg:max-w-sm">
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('filters.search')}
            aria-label={t('filters.search')}
            leading={<Search aria-hidden />}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Select
            label={t('filters.status')}
            value={filters.status}
            onValueChange={(status) => setFilter({ status })}
            options={STATUS_FILTERS.map((value) => ({
              value,
              label: t(`filters.statuses.${value}`),
            }))}
            className="sm:w-40"
          />
          <Select
            label={t('filters.scope')}
            value={filters.scope}
            onValueChange={(scope) => setFilter({ scope })}
            options={SCOPE_FILTERS.map((value) => ({ value, label: t(`filters.scopes.${value}`) }))}
            className="sm:w-40"
          />
        </div>
        <Button
          variant="primary"
          leadingIcon={<ClipboardPlus />}
          onClick={() => setParam('raise', '1')}
          className="lg:ml-auto"
        >
          {t('new')}
        </Button>
      </div>
      {requests.isPending && <ListSkeleton label={t('loading')} />}
      {requests.isError && <LoadError error={requests.error} onRetry={() => requests.refetch()} />}
      {requests.data && rows.length === 0 && (
        <EmptyState
          icon={<Inbox />}
          title={requests.data.length === 0 ? t('emptyTitle') : t('noMatchTitle')}
          description={requests.data.length === 0 ? t('emptyBody') : t('noMatchBody')}
        />
      )}
      {rows.length > 0 && (
        <>
          <p className="type-body-sm text-ink-muted">{t('count', { count: rows.length })}</p>
          <RequestsTable rows={rows} onOpen={(id) => setParam('request', id)} />
        </>
      )}
      <RequestSheet
        requestId={params.get('request')}
        onClose={() => setParam('request', null)}
        onOrder={(id) =>
          navigate((next) => {
            next.delete('request');
            next.set('order-request', id);
          })
        }
      />
      <RequestFormSheet
        open={params.get('raise') === '1'}
        projectId={params.get('projectId')}
        onClose={() => setParam('raise', null)}
        onCreated={(id) =>
          navigate((next) => {
            next.delete('raise');
            next.delete('projectId');
            next.set('request', id);
          })
        }
      />
      <OrderRequestSheet
        requestId={params.get('order-request')}
        onClose={() => setParam('order-request', null)}
      />
    </div>
  );
}
