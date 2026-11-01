'use client';

import { EmptyState, PageHeader, pageEnter, TabPanel, Tabs } from '@oneohm/design-system/web';
import type { Capability } from '@oneohm/domain';
import { Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { useCurrentUser } from '@/providers/current-user';
import { DispatchesPanel } from './dispatches/dispatches-panel';
import { OrdersPanel } from './orders/orders-panel';
import { StockPanel } from './stock/stock-panel';
import { VendorsPanel } from './vendors/vendors-panel';

const VIEW: readonly Capability[] = [
  'inventory.view',
  'inventory.manage',
  'procurement.manage',
  'dispatch.manage',
];

const TABS = [
  { value: 'stock', Panel: StockPanel },
  { value: 'orders', Panel: OrdersPanel },
  { value: 'vendors', Panel: VendorsPanel },
  { value: 'dispatches', Panel: DispatchesPanel },
] as const satisfies readonly { value: string; Panel: ComponentType }[];
type TabValue = (typeof TABS)[number]['value'];

/** Stock, purchase orders, vendors and dispatches; the open tab lives in the address. */
export function InventoryView() {
  const t = useTranslations('inventory');
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const allowed = VIEW.some((capability) => user.capabilities.includes(capability));
  const current = TABS.find((tab) => tab.value === params.get('tab')) ?? TABS[0];

  const select = (value: TabValue) => {
    const next = new URLSearchParams(params);
    next.set('tab', value);
    next.delete('order');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 py-2">
      <PageHeader
        eyebrow={<span className="type-overline uppercase">{t('overline')}</span>}
        title={t('title')}
        description={t('description')}
      />
      {allowed ? (
        <Tabs
          value={current.value}
          onValueChange={select}
          items={TABS.map((tab) => ({ value: tab.value, label: t(`tabs.${tab.value}`) }))}
          label={t('tabsLabel')}
        >
          {TABS.map(({ value, Panel }) => (
            <TabPanel key={value} value={value} className="pt-8 outline-none">
              {value === current.value && <Panel />}
            </TabPanel>
          ))}
        </Tabs>
      ) : (
        <EmptyState icon={<Lock />} title={t('noAccess')} />
      )}
    </motion.div>
  );
}
