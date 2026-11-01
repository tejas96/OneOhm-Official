'use client';

import { EmptyState, PageHeader, pageEnter, TabPanel, Tabs } from '@oneohm/design-system/web';
import type { Capability } from '@oneohm/domain';
import { Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { useCurrentUser } from '@/providers/current-user';
import { CompanyPanel } from './company/company-panel';
import { DiscomsPanel } from './discoms/discoms-panel';
import { ProductsPanel } from './products/products-panel';
import { RatesPanel } from './rates/rates-panel';
import { RolesPanel } from './roles/roles-panel';
import { MessageTemplatesPanel } from './templates/message-templates-panel';
import { TaskTemplatesPanel } from './templates/task-templates-panel';
import { WorkforcePanel } from './workforce/workforce-panel';

const TABS = [
  { value: 'roles', requires: 'roles.manage', Panel: RolesPanel },
  { value: 'company', requires: 'settings.manage', Panel: CompanyPanel },
  { value: 'products', requires: 'settings.manage', Panel: ProductsPanel },
  { value: 'rates', requires: 'settings.manage', Panel: RatesPanel },
  { value: 'discoms', requires: 'settings.manage', Panel: DiscomsPanel },
  { value: 'workforce', requires: 'settings.manage', Panel: WorkforcePanel },
  { value: 'tasks', requires: 'settings.manage', Panel: TaskTemplatesPanel },
  { value: 'messages', requires: 'settings.manage', Panel: MessageTemplatesPanel },
] as const satisfies readonly {
  value: string;
  requires: Capability;
  Panel: ComponentType;
}[];
type TabValue = (typeof TABS)[number]['value'];

/** Roles, company, catalog, rates, workforce rules and templates; the open tab lives in `?tab=`. */
export function SettingsView() {
  const t = useTranslations('settings');
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const allowed = TABS.filter((tab) => user.capabilities.includes(tab.requires));
  const requested = params.get('tab');
  const current = allowed.find((tab) => tab.value === requested) ?? allowed[0];

  const select = (value: TabValue) => {
    const next = new URLSearchParams(params);
    next.set('tab', value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 py-2">
      <PageHeader title={t('title')} description={t('description')} />
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
