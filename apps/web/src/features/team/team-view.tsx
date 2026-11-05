'use client';

import { EmptyState, PageHeader, pageEnter, TabPanel, Tabs } from '@oneohm/design-system/web';
import type { Capability } from '@oneohm/domain';
import { Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { BlockedTab } from '@/components/blocked-tab';
import { TravelTab } from '@/features/site-activity/travel/travel-tab';
import { useCurrentUser } from '@/providers/current-user';
import { AnnouncementsTab } from './announcements/announcements-tab';
import { AttendanceTab } from './attendance/attendance-tab';
import { BonusesTab } from './bonuses/bonuses-tab';
import { WorkloadTab } from './capacity/workload-tab';
import { LeaveTab } from './leave/leave-tab';
import { PeopleTab } from './people-tab';
import { PointsTab } from './points/points-tab';
import { ResellersTab } from './resellers/resellers-tab';

const TABS = [
  { value: 'people', requires: ['people.view', 'people.manage'], Panel: PeopleTab },
  {
    value: 'workload',
    requires: ['people.view', 'tasks.assign', 'projects.manage'],
    Panel: WorkloadTab,
  },
  { value: 'attendance', requires: ['people.view', 'leave.approve'], Panel: AttendanceTab },
  { value: 'leave', requires: ['leave.request', 'leave.approve'], Panel: LeaveTab },
  { value: 'points', requires: ['people.view'], Panel: PointsTab },
  {
    value: 'bonuses',
    requires: ['people.manage', 'projects.manage', 'finance.approve_payments'],
    Panel: BonusesTab,
  },
  { value: 'travel', requires: ['leave.approve', 'finance.view'], Panel: TravelTab },
  {
    value: 'resellers',
    requires: ['people.view', 'finance.view', 'settings.manage'],
    Panel: ResellersTab,
  },
  { value: 'announcements', requires: ['people.manage'], Panel: AnnouncementsTab },
] as const satisfies readonly {
  value: string;
  requires: readonly Capability[];
  Panel: ComponentType;
}[];
type TabValue = (typeof TABS)[number]['value'];

/**
 * People, workload, the day's attendance, leave, points, bonuses, travel and
 * announcements. The open tab lives in `?tab=`.
 */
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
  // A link to a tab this role cannot open says so, rather than landing on another tab.
  const blocked = TABS.find((tab) => tab.value === params.get('tab') && !allowed.includes(tab));

  // Filters, searches and open items belong to one tab, so a new tab starts clean.
  const select = (value: TabValue) => {
    router.replace(`${pathname}?${new URLSearchParams({ tab: value }).toString()}`, {
      scroll: false,
    });
  };

  return (
    <motion.div
      {...pageEnter}
      className="mx-auto flex w-full min-w-0 max-w-[90rem] flex-col gap-8 py-2"
    >
      <PageHeader title={t('title')} description={t('description')} />
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
          // The tab bar scrolls by itself; it must not widen the page.
          className="min-w-0"
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
