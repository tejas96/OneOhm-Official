'use client';

import { EmptyState, PageHeader, pageEnter, TabPanel, Tabs } from '@oneohm/design-system/web';
import type { Capability } from '@oneohm/domain';
import { Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { useCurrentUser } from '@/providers/current-user';
import { MessageLogPanel } from './message-log/message-log-panel';
import { ServiceRequestsPanel } from './service-desk-view';
import { WhatsAppInbox } from './whatsapp/whatsapp-inbox';

const MESSAGING: readonly Capability[] = ['service.manage', 'customers.manage'];

const TABS = [
  {
    value: 'requests',
    requires: ['service.manage', 'customers.view'],
    Panel: ServiceRequestsPanel,
  },
  { value: 'whatsapp', requires: MESSAGING, Panel: WhatsAppInbox },
  { value: 'log', requires: MESSAGING, Panel: MessageLogPanel },
] as const satisfies readonly {
  value: string;
  requires: readonly Capability[];
  Panel: ComponentType;
}[];
type TabValue = (typeof TABS)[number]['value'];

/** Service requests, the WhatsApp inbox and the message log. The open tab lives in `?tab=`. */
export function ServiceView() {
  const t = useTranslations('service');
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
    next.delete('chat');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[72rem] flex-col gap-8 py-2">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      {current ? (
        <Tabs
          value={current.value}
          onValueChange={select}
          items={allowed.map((tab) => ({ value: tab.value, label: t(`tabs.${tab.value}`) }))}
          label={t('tabsLabel')}
        >
          {allowed.map(({ value, Panel }) => (
            <TabPanel key={value} value={value} className="pt-6 outline-none">
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
