'use client';

import { EmptyState, PageHeader, pageEnter, TabPanel, Tabs } from '@oneohm/design-system/web';
import type { Capability } from '@oneohm/domain';
import { Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { useCurrentUser } from '@/providers/current-user';
import { RequestsPanel } from '../purchasing/requests/requests-panel';
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

/** Project people (without stock rights) may still ask for material. */
const REQUEST: readonly Capability[] = [...VIEW, 'projects.manage'];

const TABS = [
  { value: 'stock', requires: VIEW, Panel: StockPanel },
  { value: 'requests', requires: REQUEST, Panel: RequestsPanel },
  { value: 'orders', requires: VIEW, Panel: OrdersPanel },
  { value: 'vendors', requires: VIEW, Panel: VendorsPanel },
  { value: 'dispatches', requires: VIEW, Panel: DispatchesPanel },
] as const satisfies readonly {
  value: string;
  requires: readonly Capability[];
  Panel: ComponentType;
}[];
type TabValue = (typeof TABS)[number]['value'];

/** Stock, purchase orders, vendors and dispatches; the open tab lives in the address. */
export function InventoryView() {
  const t = useTranslations('inventory');
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const allowed = TABS.filter((tab) =>
    tab.requires.some((capability) => user.capabilities.includes(capability)),
  );
  const current = allowed.find((tab) => tab.value === params.get('tab')) ?? allowed[0];

  // Each tab keeps its own filters and open sheets, so a new tab starts clean.
  const select = (value: TabValue) =>
    router.replace(`${pathname}?${new URLSearchParams({ tab: value }).toString()}`, {
      scroll: false,
    });

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 py-2">
      <PageHeader
        eyebrow={<span className="type-overline uppercase">{t('overline')}</span>}
        title={t('title')}
        description={t('description')}
      />
      {current ? (
        <Tabs
          value={current.value}
          onValueChange={select}
          items={allowed.map((tab) => ({ value: tab.value, label: t(`tabs.${tab.value}`) }))}
          label={t('tabsLabel')}
        >
          {allowed.map(({ value, Panel }) => (
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
