'use client';

import { EmptyState, PageHeader, pageEnter } from '@oneohm/design-system/web';
import type { Capability } from '@oneohm/domain';
import { Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { useCurrentUser } from '@/providers/current-user';
import { ActivityPanel } from './activity/activity-panel';
import { AmcPlansPanel } from './after-sales/amc-plans-panel';
import { ServiceCategoriesPanel } from './after-sales/service-categories-panel';
import { WarrantyPanel } from './after-sales/warranty-panel';
import { CompanyPanel } from './company/company-panel';
import { DiscomsPanel } from './discoms/discoms-panel';
import { LeadStepsPanel } from './lead-steps/lead-steps-panel';
import { PaymentPlansPanel } from './payment-plans/payment-plans-panel';
import { ProductsPanel } from './products/products-panel';
import { RatesPanel } from './rates/rates-panel';
import { ReferralsPanel } from './referrals/referrals-panel';
import { RequirementsPanel } from './requirements/requirements-panel';
import { RolesPanel } from './roles/roles-panel';
import { type NavGroup, SettingsNav } from './settings-nav';
import { MessageTemplatesPanel } from './templates/message-templates-panel';
import { TaskTemplatesPanel } from './templates/task-templates-panel';
import { WorkforcePanel } from './workforce/workforce-panel';

const TABS = [
  { value: 'roles', requires: 'roles.manage', Panel: RolesPanel },
  { value: 'company', requires: 'settings.manage', Panel: CompanyPanel },
  { value: 'products', requires: 'settings.manage', Panel: ProductsPanel },
  { value: 'rates', requires: 'settings.manage', Panel: RatesPanel },
  { value: 'payments', requires: 'settings.manage', Panel: PaymentPlansPanel },
  { value: 'discoms', requires: 'settings.manage', Panel: DiscomsPanel },
  { value: 'referrals', requires: 'settings.manage', Panel: ReferralsPanel },
  { value: 'leadSteps', requires: 'settings.manage', Panel: LeadStepsPanel },
  { value: 'workforce', requires: 'settings.manage', Panel: WorkforcePanel },
  { value: 'tasks', requires: 'settings.manage', Panel: TaskTemplatesPanel },
  { value: 'documents', requires: 'settings.manage', Panel: RequirementsPanel },
  { value: 'messages', requires: 'settings.manage', Panel: MessageTemplatesPanel },
  { value: 'serviceSla', requires: 'settings.manage', Panel: ServiceCategoriesPanel },
  { value: 'warranty', requires: 'settings.manage', Panel: WarrantyPanel },
  { value: 'amcPlans', requires: 'settings.manage', Panel: AmcPlansPanel },
  { value: 'activity', requires: 'audit.view', Panel: ActivityPanel },
] as const satisfies readonly {
  value: string;
  requires: Capability;
  Panel: ComponentType;
}[];
type TabValue = (typeof TABS)[number]['value'];

const GROUPS: readonly NavGroup<TabValue>[] = [
  { key: 'organisation', items: ['company', 'roles', 'workforce'] },
  { key: 'selling', items: ['leadSteps', 'products', 'rates', 'payments', 'discoms', 'referrals'] },
  { key: 'operations', items: ['tasks', 'documents', 'messages'] },
  { key: 'afterSales', items: ['serviceSla', 'warranty', 'amcPlans'] },
  { key: 'security', items: ['activity'] },
];

/** Every setting, grouped down the side like Lintel; the open section lives in `?tab=`. */
export function SettingsView() {
  const t = useTranslations('settings');
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const allowed = TABS.filter((tab) => user.capabilities.includes(tab.requires));
  const requested = params.get('tab');
  const current = allowed.find((tab) => tab.value === requested) ?? allowed[0];
  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((value) => allowed.some((tab) => tab.value === value)),
  })).filter((group) => group.items.length > 0);

  const select = (value: TabValue) => {
    const next = new URLSearchParams(params);
    next.set('tab', value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 py-2">
      <PageHeader title={t('title')} description={t('description')} />
      {current ? (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <SettingsNav
            groups={groups}
            current={current.value}
            onSelect={select}
            labelOf={(value) => t(`tabs.${value}`)}
          />
          <div className="min-w-0">
            <current.Panel />
          </div>
        </div>
      ) : (
        <EmptyState icon={<Lock />} title={t('noAccess')} />
      )}
    </motion.div>
  );
}
