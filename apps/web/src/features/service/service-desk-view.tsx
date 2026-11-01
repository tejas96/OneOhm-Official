'use client';

import type { ServiceTicket } from '@oneohm/api-contracts';
import { EmptyState, PageHeader, pageEnter, SegmentedControl } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { Headset } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { FeedbackPanel } from './feedback-panel';
import { TicketRow } from './ticket-row';

const VIEWS = ['open', 'in_progress', 'resolved', 'all', 'feedback'] as const;
type View = (typeof VIEWS)[number];

/** Requests customers raise in the app, worked to resolution; and what they rated us. */
export function ServiceDeskView() {
  const t = useTranslations('service');
  const [view, setView] = useState<View>('open');
  const status = view === 'all' || view === 'feedback' ? undefined : view;
  const query = useQuery({
    queryKey: ['service-requests', status ?? 'all'],
    queryFn: () =>
      expectStatus(api.serviceDesk.listTickets({ query: status ? { status } : {} }), 200),
    enabled: view !== 'feedback',
  });
  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[72rem] flex-col gap-8 py-2">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <SegmentedControl
        label={t('viewLabel')}
        size="sm"
        value={view}
        onValueChange={setView}
        options={VIEWS.map((value) => ({ value, label: t(`views.${value}`) }))}
        className="self-start"
      />
      {view === 'feedback' ? (
        <FeedbackPanel />
      ) : (
        <Tickets query={query} empty={t(`empty.${view}`)} />
      )}
    </motion.div>
  );
}

function Tickets({
  query,
  empty,
}: {
  readonly query: ReturnType<typeof useQuery<ServiceTicket[]>>;
  readonly empty: string;
}) {
  const t = useTranslations('service');
  if (query.isPending) return <ListSkeleton label={t('loading')} />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  if (query.data.length === 0) return <EmptyState icon={<Headset />} title={empty} />;
  return (
    <ul className="flex flex-col divide-y divide-hairline">
      {query.data.map((ticket, index) => (
        <TicketRow key={ticket.id} ticket={ticket} index={index} />
      ))}
    </ul>
  );
}
