'use client';

import { EmptyState, PageHeader, pageEnter, TabPanel, Tabs } from '@oneohm/design-system/web';
import type { Capability } from '@oneohm/domain';
import { Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { useCurrentUser } from '@/providers/current-user';
import { AttendanceTab } from './attendance/attendance-tab';
import { LeaveTab } from './leave/leave-tab';
import { PeopleTab } from './people-tab';
import { PointsTab } from './points/points-tab';

const TABS = [
  { value: 'people', requires: ['people.view', 'people.manage'], Panel: PeopleTab },
  { value: 'attendance', requires: ['people.view', 'leave.approve'], Panel: AttendanceTab },
  { value: 'leave', requires: ['leave.request', 'leave.approve'], Panel: LeaveTab },
  { value: 'points', requires: ['people.view'], Panel: PointsTab },
] as const satisfies readonly {
  value: string;
  requires: readonly Capability[];
  Panel: ComponentType;
}[];
type TabValue = (typeof TABS)[number]['value'];

/** People, the day's attendance, leave and points. The open tab lives in `?tab=`. */
export function TeamView() {
  const t = useTranslations('team');
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
