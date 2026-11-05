'use client';

import {
  SERVICE_KINDS,
  type ServicePage,
  type ServiceTicket,
  SLA_FILTERS,
} from '@oneohm/api-contracts';
import { EmptyState, SegmentedControl, Select } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { Headset } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LoadMore } from '@/components/load-more';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { usePagedList } from '@/lib/query/use-paged-list';
import { matchesSearch, useSearchParam } from '@/lib/use-search-param';
import { FeedbackPanel } from './feedback-panel';
import { ServiceSearch } from './service-search';
import { TicketSheet } from './ticket-sheet';
import { TicketsTable } from './tickets-table';
import { SERVICE_KEY } from './use-service-desk';

const VIEWS = ['open', 'in_progress', 'resolved', 'all', 'feedback'] as const;
type View = (typeof VIEWS)[number];
type Sla = (typeof SLA_FILTERS)[number] | 'all';
type Kind = (typeof SERVICE_KINDS)[number] | 'all';

const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
  allowed.find((item) => item === value) ?? fallback;

/** The desk's filters live in the URL (`view`, `sla`, `kind`, `q`, and the open `request`). */
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
  const { draft, setDraft, search } = useSearchParam();
  const status = desk.view === 'all' || desk.view === 'feedback' ? undefined : desk.view;
  const asked = {
    ...(status ? { status } : {}),
    ...(desk.sla === 'all' ? {} : { sla: desk.sla }),
    ...(desk.kind === 'all' ? {} : { kind: desk.kind }),
    ...(search ? { q: search } : {}),
  };
  // Newest first, a page at a time (PRD 9.3).
  const list = usePagedList<ServiceTicket, ServicePage>(
    [...SERVICE_KEY, 'page', asked],
    (cursor) =>
      expectStatus(
        api.lists.serviceRequests({
          query: { ...asked, limit: 30, ...(cursor ? { cursor } : {}) },
        }),
        200,
      ),
    { enabled: desk.view !== 'feedback' },
  );
  const filtered = desk.sla !== 'all' || desk.kind !== 'all';
  const empty = search
    ? t('emptySearch', { term: search })
    : filtered
      ? t('emptyFiltered')
      : t(`empty.${desk.view}`);
  // Searched again here, so an older API that ignores `q` still shows only matches.
  const items = list.items.filter((ticket) =>
    matchesSearch(search, [
      ticket.customer.name,
      ticket.customer.phone,
      ticket.description,
      ticket.category,
      ticket.categoryLabel,
      ticket.project?.code,
      ticket.project?.code.replace(/[-/]/g, ''),
    ]),
  );
  const open = useOpenTicket(list.items, desk.request);

  return (
    <div className="flex flex-col gap-5">
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <ServiceSearch
            value={draft}
            onChange={setDraft}
            label={t('searchLabel')}
            placeholder={t('searchPlaceholder')}
          />
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
        </div>
      )}
      {desk.view === 'feedback' ? (
        <FeedbackPanel />
      ) : (
        <Tickets
          list={list}
          items={items}
          empty={empty}
          onOpen={(request) => desk.set({ request })}
        />
      )}
      <TicketSheet ticket={open} onClose={() => desk.set({ request: null })} />
    </div>
  );
}

/**
 * The request open in the sheet: from the rows already loaded, or fetched on its own
 * when a link (an alert) names one further down the list.
 */
function useOpenTicket(loaded: readonly ServiceTicket[], id: string | null) {
  const here = id ? (loaded.find((ticket) => ticket.id === id) ?? null) : null;
  const alone = useQuery({
    queryKey: [...SERVICE_KEY, 'one', id],
    queryFn: () =>
      expectStatus(api.lists.serviceRequests({ query: { id: id ?? '', limit: 1 } }), 200),
    enabled: Boolean(id) && !here,
  });
  return here ?? alone.data?.items[0] ?? null;
}

function Tickets({
  list,
  items,
  empty,
  onOpen,
}: {
  readonly list: ReturnType<typeof usePagedList<ServiceTicket, ServicePage>>;
  readonly items: readonly ServiceTicket[];
  readonly empty: string;
  readonly onOpen: (id: string) => void;
}) {
  const t = useTranslations('service');
  const { query } = list;
  if (query.isPending) return <ListSkeleton label={t('loading')} />;
  if (query.isError && items.length === 0)
    return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  if (items.length === 0) return <EmptyState icon={<Headset />} title={empty} />;
  return (
    <div className="flex flex-col gap-3">
      <p className="type-body-sm text-ink-faint">{t('count', { count: list.total })}</p>
      <TicketsTable tickets={items} onOpen={onOpen} />
      <LoadMore
        shown={list.items.length}
        total={list.total}
        hasMore={list.hasMore}
        loading={list.loadingMore}
        onMore={list.loadMore}
        className="pt-4"
      />
    </div>
  );
}
