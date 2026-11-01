'use client';

import { SERVICE_KINDS, type ServiceTicket, SLA_FILTERS } from '@oneohm/api-contracts';
import { EmptyState, SegmentedControl, Select } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { Headset } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { FeedbackPanel } from './feedback-panel';
import { TicketSheet } from './ticket-sheet';
import { TicketsTable } from './tickets-table';
import { SERVICE_KEY } from './use-service-desk';

const VIEWS = ['open', 'in_progress', 'resolved', 'all', 'feedback'] as const;
type View = (typeof VIEWS)[number];
type Sla = (typeof SLA_FILTERS)[number] | 'all';
type Kind = (typeof SERVICE_KINDS)[number] | 'all';

const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
  allowed.find((item) => item === value) ?? fallback;

/** The desk's filters live in the URL (`view`, `sla`, `kind`, and the open `request`). */
function useDeskParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (patch: Readonly<Record<string, string | null>>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return {
    view: pick<View>(params.get('view'), VIEWS, 'open'),
    sla: pick<Sla>(params.get('sla'), [...SLA_FILTERS, 'all'], 'all'),
    kind: pick<Kind>(params.get('kind'), [...SERVICE_KINDS, 'all'], 'all'),
    request: params.get('request'),
    set,
  };
}

/** Requests and planned visits, worked against their promised times; and customer ratings. */
export function ServiceRequestsPanel() {
  const t = useTranslations('service');
  const desk = useDeskParams();
  const status = desk.view === 'all' || desk.view === 'feedback' ? undefined : desk.view;
  const query = useQuery({
    queryKey: [...SERVICE_KEY, status ?? 'all', desk.sla, desk.kind],
    queryFn: () =>
      expectStatus(
        api.serviceDesk.listTickets({
          query: {
            ...(status ? { status } : {}),
            ...(desk.sla === 'all' ? {} : { sla: desk.sla }),
            ...(desk.kind === 'all' ? {} : { kind: desk.kind }),
          },
        }),
        200,
      ),
    enabled: desk.view !== 'feedback',
  });
  const filtered = desk.sla !== 'all' || desk.kind !== 'all';
  const open = query.data?.find((ticket) => ticket.id === desk.request) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedControl
            label={t('viewLabel')}
            size="sm"
            value={desk.view}
            onValueChange={(view) => desk.set({ view })}
            options={VIEWS.map((value) => ({ value, label: t(`views.${value}`) }))}
          />
        </div>
        {desk.view !== 'feedback' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[30rem]">
            <Select<Sla>
              label={t('filters.slaLabel')}
              value={desk.sla}
              onValueChange={(sla) => desk.set({ sla: sla === 'all' ? null : sla })}
              options={(['all', ...SLA_FILTERS] as const).map((value) => ({
                value,
                label: t(`filters.sla.${value}`),
              }))}
            />
            <Select<Kind>
              label={t('filters.kindLabel')}
              value={desk.kind}
              onValueChange={(kind) => desk.set({ kind: kind === 'all' ? null : kind })}
              options={(['all', ...SERVICE_KINDS] as const).map((value) => ({
                value,
                label: t(`filters.kind.${value}`),
              }))}
            />
          </div>
        )}
      </div>
      {desk.view === 'feedback' ? (
        <FeedbackPanel />
      ) : (
        <Tickets
          query={query}
          empty={filtered ? t('emptyFiltered') : t(`empty.${desk.view}`)}
          onOpen={(request) => desk.set({ request })}
        />
      )}
      <TicketSheet ticket={open} onClose={() => desk.set({ request: null })} />
    </div>
  );
}

function Tickets({
  query,
  empty,
  onOpen,
}: {
  readonly query: ReturnType<typeof useQuery<ServiceTicket[]>>;
  readonly empty: string;
  readonly onOpen: (id: string) => void;
}) {
  const t = useTranslations('service');
  if (query.isPending) return <ListSkeleton label={t('loading')} />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  if (query.data.length === 0) return <EmptyState icon={<Headset />} title={empty} />;
  return (
    <div className="flex flex-col gap-3">
      <p className="type-body-sm text-ink-faint">{t('count', { count: query.data.length })}</p>
      <TicketsTable tickets={query.data} onOpen={onOpen} />
    </div>
  );
}
