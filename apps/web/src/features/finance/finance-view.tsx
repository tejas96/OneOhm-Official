'use client';

import { EmptyState, PageHeader, pageEnter, TabPanel, Tabs } from '@oneohm/design-system/web';
import type { Capability } from '@oneohm/domain';
import { Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { BlockedTab } from '@/components/blocked-tab';
import { useCurrentUser } from '@/providers/current-user';
import { AdvancesTab } from '../purchasing/advances/advances-tab';
import { InvoicesTab } from './billing/invoices-tab';
import { CashTab } from './cash/cash-tab';
import { LedgerTab } from './ledger/ledger-tab';
import { LoansTab } from './loans/loans-tab';
import { OverviewTab } from './overview/overview-tab';
import { PayablesTab } from './payables/payables-tab';
import { PayoutsTab } from './payouts/payouts-tab';
import { ReceivablesTab } from './receivables/receivables-tab';

const VIEW: readonly Capability[] = ['finance.view', 'finance.record_payments'];
const TABS = [
  { value: 'overview', requires: VIEW, Panel: OverviewTab },
  { value: 'receivables', requires: VIEW, Panel: ReceivablesTab },
  { value: 'cash', requires: VIEW, Panel: CashTab },
  { value: 'invoices', requires: VIEW, Panel: InvoicesTab },
  { value: 'payables', requires: VIEW, Panel: PayablesTab },
  { value: 'advances', requires: VIEW, Panel: AdvancesTab },
  { value: 'payouts', requires: VIEW, Panel: PayoutsTab },
  { value: 'loans', requires: [...VIEW, 'loans.manage'], Panel: LoansTab },
  { value: 'ledger', requires: VIEW, Panel: LedgerTab },
] as const satisfies readonly {
  value: string;
  requires: readonly Capability[];
  Panel: ComponentType;
}[];
type TabValue = (typeof TABS)[number]['value'];

/** Money in, money out, bank finance and the books. The open tab lives in `?tab=`. */
export function FinanceView() {
  const t = useTranslations('finance');
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const allowed = TABS.filter((tab) =>
    tab.requires.some((capability) => user.capabilities.includes(capability)),
  );
  const current = allowed.find((tab) => tab.value === params.get('tab')) ?? allowed[0];
  // A link to a tab this role cannot open says so, rather than landing on another tab.
  const blocked = TABS.find((tab) => tab.value === params.get('tab') && !allowed.includes(tab));

  // Filters, searches and open items belong to one tab, so a new tab starts clean.
  const select = (value: TabValue) => {
    router.replace(`${pathname}?${new URLSearchParams({ tab: value }).toString()}`, {
      scroll: false,
    });
  };

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 py-2">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      {blocked ? (
        <BlockedTab
          tab={t(`tabs.${blocked.value}`)}
          fallback={current ? t(`tabs.${current.value}`) : null}
          onFallback={() => current && select(current.value)}
        />
      ) : current ? (
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
