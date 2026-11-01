'use client';

import type { ProjectSummary, Property, QuotationSummary } from '@oneohm/api-contracts';
import { TabPanel, Tabs } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { DocumentsGallery } from '@/features/documents/gallery/documents-gallery';
import { CustomerConversationsTab } from './customer-conversations-tab';
import { CustomerMoneyTab } from './customer-money-tab';
import { CustomerOverviewTab } from './customer-overview-tab';
import { CustomerServiceTab } from './customer-service-tab';
import {
  CUSTOMER_TABS,
  type CustomerTab,
  useCustomerActivity,
  useCustomerTab,
} from './use-customer-tab';

export interface CustomerRecord {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly properties: readonly Property[];
  readonly projects: readonly ProjectSummary[];
  readonly quotations: readonly QuotationSummary[];
}

/** The customer 360's sections, one at a time; the open one is `?tab=` in the URL. */
export function CustomerTabs({ customer }: { readonly customer: CustomerRecord }) {
  const t = useTranslations('customers.tabs');
  const { tab, select } = useCustomerTab();
  const frame = useRef<HTMLDivElement>(null);
  const activity = useCustomerActivity(customer.id);
  const openRequests = activity.data?.serviceRequests.filter(
    (request) => request.status !== 'resolved',
  ).length;
  const counts: Partial<Record<CustomerTab, number>> = openRequests
    ? { service: openRequests }
    : {};

  const withActivity = (render: (data: NonNullable<typeof activity.data>) => ReactNode) => {
    if (activity.isPending) return <ActivityLoading />;
    if (activity.isError) {
      return <LoadError error={activity.error} onRetry={() => activity.refetch()} />;
    }
    return render(activity.data);
  };

  const panel = (value: CustomerTab): ReactNode => {
    switch (value) {
      case 'overview':
        return <CustomerOverviewTab customer={customer} />;
      case 'money':
        return withActivity((data) => <CustomerMoneyTab activity={data} />);
      case 'conversations':
        return withActivity((data) => (
          <CustomerConversationsTab activity={data} name={customer.name} phone={customer.phone} />
        ));
      case 'service':
        return withActivity((data) => <CustomerServiceTab activity={data} />);
      case 'documents':
        return <DocumentsGallery scope={{ customerId: customer.id }} />;
    }
  };

  // A link straight to a later tab on a phone: bring its tab into view in the scrolling bar.
  useEffect(() => {
    const triggers = frame.current?.querySelectorAll<HTMLElement>('[role="tab"]');
    triggers?.[CUSTOMER_TABS.indexOf(tab)]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab]);

  return (
    <div ref={frame} className="min-w-0">
      <Tabs
        value={tab}
        onValueChange={select}
        label={t('label')}
        items={CUSTOMER_TABS.map((value) => {
          const count = counts[value];
          return { value, label: t(value), ...(count === undefined ? {} : { count }) };
        })}
        className="min-w-0"
      >
        {CUSTOMER_TABS.map((value) => (
          <TabPanel key={value} value={value} className="min-w-0 pt-8 outline-none">
            {value === tab && panel(value)}
          </TabPanel>
        ))}
      </Tabs>
    </div>
  );
}

function ActivityLoading() {
  const t = useTranslations('customers');
  return <ListSkeleton label={t('activityLoading')} rows={4} />;
}
