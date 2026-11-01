'use client';

import {
  Badge,
  Button,
  Card,
  CardHeader,
  pageEnter,
  Skeleton,
  SkeletonGroup,
  TabPanel,
  Tabs,
} from '@oneohm/design-system/web';
import { ArrowLeft, HandCoins, PencilLine } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LoadError } from '@/components/query-state';
import { formatPhone } from '@/lib/format/contact';
import { useCan } from '@/providers/current-user';
import { AgeingBars } from '../../finance/overview/ageing-bars';
import { VendorDialog } from '../../inventory/vendors/vendor-dialog';
import { RecordAdvanceDialog } from '../advances/record-advance-dialog';
import { useVendorProfile } from '../use-purchasing';
import { VendorKpis } from './vendor-kpis';
import { VendorAdvancesTable, VendorBillsTable } from './vendor-money-tables';
import { VendorOrdersTable, VendorRejectionsTable } from './vendor-supply-tables';

const TABS = ['orders', 'bills', 'advances', 'inspection'] as const;
type TabValue = (typeof TABS)[number];

/** One vendor (PRD 3.10): delivery record, what is owed by age, advances and orders. */
export function VendorProfileView({ id }: { readonly id: string }) {
  const t = useTranslations('purchasing.profile');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = useVendorProfile(id);
  const canManage = useCan('procurement.manage');
  const canPay = useCan('finance.record_payments');
  const [editing, setEditing] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const tab = TABS.find((value) => value === params.get('tab')) ?? 'orders';
  const select = (value: TabValue) => {
    const next = new URLSearchParams(params);
    next.set('tab', value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  if (query.isPending) {
    return (
      <SkeletonGroup
        label={t('loading')}
        className="mx-auto flex w-full max-w-[90rem] flex-col gap-6"
      >
        <Skeleton className="h-32 w-2/3 rounded-2xl" />
        <Skeleton className="h-64 rounded-[28px]" />
      </SkeletonGroup>
    );
  }
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  const { vendor, scorecard } = query.data;
  const counts: Readonly<Record<TabValue, number>> = {
    orders: query.data.orders.length,
    bills: query.data.bills.length,
    advances: query.data.advances.length,
    inspection: query.data.rejections.length,
  };

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 py-2">
      <Link
        href="/inventory?tab=vendors"
        className="inline-flex w-fit items-center gap-1.5 type-body-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t('back')}
      </Link>
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="flex flex-wrap items-center gap-2 font-mono text-[0.75rem] text-ink-faint uppercase">
            {t('overline', { days: vendor.paymentTermsDays })}
            {vendor.gstin && <span>· GSTIN {vendor.gstin}</span>}
            {!vendor.active && <Badge>{t('inactive')}</Badge>}
          </p>
          <h1 className="type-display-lg text-balance break-words text-ink">{vendor.name}</h1>
          <p className="type-body text-ink-muted">
            {[vendor.contactName, vendor.phone && formatPhone(vendor.phone), vendor.address]
              .filter(Boolean)
              .join(' · ') || t('noContact')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <Button
              variant="secondary"
              leadingIcon={<PencilLine />}
              onClick={() => setEditing(true)}
            >
              {t('edit')}
            </Button>
          )}
          {canPay && (
            <Button
              variant="primary"
              leadingIcon={<HandCoins />}
              onClick={() => setAdvancing(true)}
            >
              {t('advance')}
            </Button>
          )}
        </div>
      </header>
      <VendorKpis scorecard={scorecard} />
      <Card>
        <CardHeader title={t('ageing.title')} description={t('ageing.description')} />
        <div className="px-5 pb-5">
          <AgeingBars ageing={scorecard.ageing} />
        </div>
      </Card>
      <Tabs
        value={tab}
        onValueChange={select}
        items={TABS.map((value) => ({
          value,
          label: t(`tabs.${value}`, { count: counts[value] }),
        }))}
        label={t('tabsLabel')}
      >
        <TabPanel value="orders" className="pt-6 outline-none">
          {tab === 'orders' && <VendorOrdersTable orders={query.data.orders} />}
        </TabPanel>
        <TabPanel value="bills" className="pt-6 outline-none">
          {tab === 'bills' && <VendorBillsTable bills={query.data.bills} />}
        </TabPanel>
        <TabPanel value="advances" className="pt-6 outline-none">
          {tab === 'advances' && <VendorAdvancesTable advances={query.data.advances} />}
        </TabPanel>
        <TabPanel value="inspection" className="pt-6 outline-none">
          {tab === 'inspection' && <VendorRejectionsTable rejections={query.data.rejections} />}
        </TabPanel>
      </Tabs>
      <VendorDialog open={editing} vendor={vendor} onClose={() => setEditing(false)} />
      <RecordAdvanceDialog
        open={advancing}
        vendorId={vendor.id}
        onClose={() => setAdvancing(false)}
      />
    </motion.div>
  );
}
