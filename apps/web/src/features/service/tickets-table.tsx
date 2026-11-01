'use client';

import type { ServiceTicket } from '@oneohm/api-contracts';
import {
  Badge,
  type PillTone,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { CalendarClock, Camera } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { formatPhone } from '@/lib/format/contact';
import { SlaCell } from './sla-pill';
import { useAgo } from './use-ago';

export const STATUS_TONE: Readonly<Record<ServiceTicket['status'], PillTone>> = {
  open: 'atRisk',
  in_progress: 'review',
  resolved: 'done',
};

const VISIT_DATE = { weekday: 'short', day: 'numeric', month: 'short' } as const;

function RequestCell({
  ticket,
  onOpen,
}: {
  readonly ticket: ServiceTicket;
  readonly onOpen: (id: string) => void;
}) {
  const t = useTranslations('service');
  const format = useFormatter();
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <button
        type="button"
        onClick={() => onOpen(ticket.id)}
        className="oh-stretched-link text-left type-body font-medium text-ink hover:text-accent"
      >
        {ticket.categoryLabel}
      </button>
      <span className="line-clamp-2 type-body-sm text-ink-muted md:max-w-[22rem]">
        {ticket.description}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {ticket.kind === 'maintenance_visit' && (
          <Badge variant="accent">
            <CalendarClock aria-hidden className="size-3" />
            {ticket.scheduledFor
              ? t('visitOn', { date: format.dateTime(new Date(ticket.scheduledFor), VISIT_DATE) })
              : t('kind.maintenance_visit')}
          </Badge>
        )}
        {ticket.photos.length > 0 && (
          <span className="inline-flex items-center gap-1 type-label text-ink-faint">
            <Camera aria-hidden className="size-3.5" />
            {t('photos', { count: ticket.photos.length })}
          </span>
        )}
      </span>
    </span>
  );
}

/** The desk's requests with their promised times; a row opens the request. */
export function TicketsTable({
  tickets,
  onOpen,
}: {
  readonly tickets: readonly ServiceTicket[];
  readonly onOpen: (id: string) => void;
}) {
  const t = useTranslations('service');
  const ago = useAgo();
  const columns: readonly TableColumn<ServiceTicket>[] = [
    {
      key: 'request',
      header: t('columns.request'),
      primary: true,
      cell: (ticket) => <RequestCell ticket={ticket} onOpen={onOpen} />,
    },
    {
      key: 'customer',
      header: t('columns.customer'),
      cell: (ticket) => (
        <span className="flex flex-col gap-0.5">
          <Link
            href={`/customers/${ticket.customer.id}`}
            className="relative z-10 whitespace-nowrap font-medium text-ink hover:text-accent"
          >
            {ticket.customer.name}
          </Link>
          <span className="whitespace-nowrap type-body-sm text-ink-faint tabular-nums">
            {formatPhone(ticket.customer.phone)}
            {ticket.project ? ` · ${ticket.project.code}` : ''}
          </span>
        </span>
      ),
    },
    {
      key: 'assignee',
      header: t('columns.assignee'),
      cell: (ticket) =>
        ticket.assignee ? (
          <span className="whitespace-nowrap">{ticket.assignee.name}</span>
        ) : (
          <span
            className={
              ticket.status === 'resolved'
                ? 'whitespace-nowrap text-ink-faint'
                : 'whitespace-nowrap text-at-risk'
            }
          >
            {t('unassigned')}
          </span>
        ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (ticket) => (
        <StatusPill
          size="sm"
          tone={STATUS_TONE[ticket.status]}
          label={t(`status.${ticket.status}`)}
        />
      ),
    },
    {
      key: 'response',
      header: t('columns.response'),
      cell: (ticket) => (
        <SlaCell
          state={ticket.sla.response}
          dueAt={ticket.responseDueAt}
          doneAt={ticket.respondedAt ?? ticket.resolvedAt}
        />
      ),
    },
    {
      key: 'resolution',
      header: t('columns.resolution'),
      cell: (ticket) => (
        <SlaCell
          state={ticket.sla.resolution}
          dueAt={ticket.resolutionDueAt}
          doneAt={ticket.resolvedAt}
        />
      ),
    },
    {
      key: 'raised',
      header: t('columns.raised'),
      hideOnPhone: true,
      cell: (ticket) => (
        <span className="whitespace-nowrap type-body-sm text-ink-faint">
          {ago(ticket.createdAt)}
        </span>
      ),
    },
  ];
  return (
    <ResponsiveTable
      caption={t('caption')}
      columns={columns}
      rows={tickets}
      rowKey={(ticket) => ticket.id}
    />
  );
}
