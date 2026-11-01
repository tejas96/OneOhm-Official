'use client';

import { Button, PageHeader, pageEnter, TabPanel, Tabs } from '@oneohm/design-system/web';
import { FilePlus2 } from 'lucide-react';
import { motion } from 'motion/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { ChangeRequestsList } from './change-requests-list';
import { DiscomDeskGroups } from './discom-desk';
import { RaiseChangeRequestDialog } from './raise-change-request-dialog';
import { StepAverages } from './step-averages';
import { useDiscomDesk } from './use-discom';

type Tab = 'desk' | 'requests';

/** The open tab lives in `?tab=`, so "change requests" can open straight on its list. */
function useDiscomTab(): readonly [Tab, (next: Tab) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab: Tab = params.get('tab') === 'requests' ? 'requests' : 'desk';
  const set = (next: Tab) =>
    router.replace(next === 'desk' ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  return [tab, set];
}

/** The DISCOM desk: everything waiting on the utility, and the change requests. */
export function DiscomView() {
  const t = useTranslations('discom');
  const desk = useDiscomDesk();
  const [tab, setTab] = useDiscomTab();
  const [raising, setRaising] = useState(false);
  const totals = desk.data?.totals;

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 py-2">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          <Button variant="primary" leadingIcon={<FilePlus2 />} onClick={() => setRaising(true)}>
            {t('raiseButton')}
          </Button>
        }
      />
      {totals && (
        <dl className="grid grid-cols-3 gap-6 border-y border-hairline py-5 sm:max-w-2xl">
          {(['waiting', 'followUpsDue', 'openChangeRequests'] as const).map((key) => (
            <div key={key} className="flex flex-col gap-1">
              <dt className="type-overline text-ink-faint uppercase">{t(`totals.${key}`)}</dt>
              <dd className="type-display-md text-ink tabular-nums">{totals[key]}</dd>
            </div>
          ))}
        </dl>
      )}
      <Tabs
        label={t('tabsLabel')}
        value={tab}
        onValueChange={setTab}
        items={[
          { value: 'desk', label: t('tabs.desk'), ...(totals ? { count: totals.waiting } : {}) },
          {
            value: 'requests',
            label: t('tabs.requests'),
            ...(totals ? { count: totals.openChangeRequests } : {}),
          },
        ]}
      >
        <TabPanel value="desk" className="grid grid-cols-1 gap-8 pt-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            {desk.isPending && <ListSkeleton label={t('loading')} rows={4} />}
            {desk.isError && <LoadError error={desk.error} onRetry={() => desk.refetch()} />}
            {desk.data && <DiscomDeskGroups desk={desk.data} />}
          </div>
          <div className="lg:col-span-4">{desk.data && <StepAverages desk={desk.data} />}</div>
        </TabPanel>
        <TabPanel value="requests" className="pt-6">
          <ChangeRequestsList />
        </TabPanel>
      </Tabs>
      <RaiseChangeRequestDialog open={raising} onOpenChange={setRaising} />
    </motion.div>
  );
}
