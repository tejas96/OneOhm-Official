'use client';

import { EmptyState, PageHeader, pageEnter, TabPanel, Tabs } from '@oneohm/design-system/web';
import type { Capability } from '@oneohm/domain';
import { Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { useCurrentUser } from '@/providers/current-user';
import { InvoicesTab } from './billing/invoices-tab';
import { LedgerTab } from './ledger/ledger-tab';
import { LoansTab } from './loans/loans-tab';
import { OverviewTab } from './overview/overview-tab';
import { PayablesTab } from './payables/payables-tab';
import { ReceivablesTab } from './receivables/receivables-tab';

const VIEW: readonly Capability[] = ['finance.view', 'finance.record_payments'];
const TABS = [
  { value: 'overview', requires: VIEW, Panel: OverviewTab },
  { value: 'receivables', requires: VIEW, Panel: ReceivablesTab },
  { value: 'invoices', requires: VIEW, Panel: InvoicesTab },
  { value: 'payables', requires: VIEW, Panel: PayablesTab },
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

  const select = (value: TabValue) => {
    const next = new URLSearchParams(params);
    next.set('tab', value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 py-2">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
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
