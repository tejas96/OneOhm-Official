'use client';

import type { Vendor } from '@oneohm/api-contracts';
import {
  Badge,
  Button,
  EmptyState,
  ResponsiveTable,
  type TableColumn,
} from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { Plus, Store } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { formatPhone } from '@/lib/format/contact';
import { useCan } from '@/providers/current-user';
import { useVendors } from '../use-inventory';
import { VendorDialog } from './vendor-dialog';

/** Who OneOhm buys from: what they supply, open orders and what is owed. */
export function VendorsPanel() {
  const t = useTranslations('inventory.vendors');
  const vendors = useVendors();
  const canManage = useCan('procurement.manage');
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [adding, setAdding] = useState(false);

  if (vendors.isPending) return <ListSkeleton label={t('loading')} />;
  if (vendors.isError) return <LoadError error={vendors.error} onRetry={() => vendors.refetch()} />;

  const columns: readonly TableColumn<Vendor>[] = [
    {
      key: 'vendor',
      header: t('columns.vendor'),
      primary: true,
      cell: (vendor) => (
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2">
            {canManage ? (
              <button
                type="button"
                onClick={() => setEditing(vendor)}
                className="oh-stretched-link truncate text-left type-body font-medium text-ink hover:text-accent"
              >
                {vendor.name}
              </button>
            ) : (
              <span className="truncate type-body font-medium text-ink">{vendor.name}</span>
            )}
            {!vendor.active && <Badge variant="soft">{t('inactive')}</Badge>}
          </span>
          {vendor.gstin && (
            <span className="font-mono text-[0.75rem] text-ink-faint">{vendor.gstin}</span>
          )}
        </span>
      ),
    },
    {
      key: 'contact',
      header: t('columns.contact'),
      cell: (vendor) => (
        <span className="flex flex-col type-body-sm">
          <span className="text-ink">{vendor.contactName ?? '—'}</span>
          {vendor.phone && (
            <span className="font-mono text-[0.75rem] text-ink-faint">
              {formatPhone(vendor.phone)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'supplies',
      header: t('columns.supplies'),
      hideOnPhone: true,
      cell: (vendor) => (
        <span className="text-ink-muted">{t('supplies', { count: vendor.productIds.length })}</span>
      ),
    },
    {
      key: 'terms',
      header: t('columns.terms'),
      hideOnPhone: true,
      cell: (vendor) => (
        <span className="text-ink-muted">{t('terms', { days: vendor.paymentTermsDays })}</span>
      ),
    },
    {
      key: 'open',
      header: t('columns.open'),
      align: 'end',
      cell: (vendor) => <span className="font-mono">{vendor.openOrders}</span>,
    },
    {
      key: 'outstanding',
      header: t('columns.outstanding'),
      align: 'end',
      cell: (vendor) => (
        <span className={vendor.outstandingPaise > 0 ? 'text-ink tabular-nums' : 'text-ink-faint'}>
          {formatInr(vendor.outstandingPaise)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {canManage && (
        <div className="flex justify-end">
          <Button variant="primary" leadingIcon={<Plus />} onClick={() => setAdding(true)}>
            {t('new')}
          </Button>
        </div>
      )}
      {vendors.data.length === 0 ? (
        <EmptyState icon={<Store />} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : (
        <ResponsiveTable
          caption={t('caption')}
          columns={columns}
          rows={vendors.data}
          rowKey={(vendor) => vendor.id}
        />
      )}
      <VendorDialog
        open={adding || editing !== null}
        vendor={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </div>
  );
}
