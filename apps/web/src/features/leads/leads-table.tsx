'use client';

import type { Lead } from '@oneohm/api-contracts';
import {
  Avatar,
  cn,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { formatKwp } from '@oneohm/shared';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { formatPhone, swatchFor } from '@/lib/format/contact';
import { isOpenLead, STAGE_TONE } from './lead-labels';

/** The lead list: a table on desktop, cards on phones. The name opens the lead. */
export function LeadsTable({
  leads,
  today,
}: {
  readonly leads: readonly Lead[];
  readonly today: string;
}) {
  const t = useTranslations('leads');
  const columns: TableColumn<Lead>[] = [
    {
      key: 'lead',
      header: t('columns.lead'),
      primary: true,
      cell: (lead) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={`/leads/${lead.id}`}
            className="oh-stretched-link truncate type-title-md text-ink [font-family:var(--font-display)] hover:text-accent"
          >
            {lead.name}
          </Link>
          <span className="truncate font-mono text-[0.75rem] text-ink-faint">
            {formatPhone(lead.phone)} · {lead.city}
          </span>
        </div>
      ),
    },
    {
      key: 'stage',
      header: t('columns.stage'),
      cell: (lead) => (
        <StatusPill
          tone={STAGE_TONE[lead.stage]}
          label={lead.step?.name ?? t(`stage.${lead.stage}`)}
          size="sm"
        />
      ),
    },
    {
      key: 'next',
      header: t('columns.next'),
      cell: (lead) => <NextAction lead={lead} today={today} />,
    },
    {
      key: 'owner',
      header: t('columns.owner'),
      cell: (lead) =>
        lead.owner ? (
          <span className="inline-flex items-center gap-2">
            <Avatar name={lead.owner.fullName} swatch={swatchFor(lead.owner.id)} size="sm" />
            <span className="truncate type-body-sm">{lead.owner.fullName}</span>
          </span>
        ) : (
          <span className="type-body-sm text-ink-faint">{t('unassigned')}</span>
        ),
    },
    {
      key: 'size',
      header: t('columns.size'),
      hideOnPhone: true,
      align: 'end',
      cell: (lead) => (
        <span className="font-mono text-[0.8125rem] text-ink-muted">
          {lead.estimatedWp ? formatKwp(lead.estimatedWp) : '—'}
        </span>
      ),
    },
    {
      key: 'source',
      header: t('columns.source'),
      hideOnPhone: true,
      cell: (lead) => (
        <span className="type-body-sm text-ink-muted">{t(`source.${lead.source}`)}</span>
      ),
    },
  ];
  return (
    <ResponsiveTable
      caption={t('title')}
      columns={columns}
      rows={leads}
      rowKey={(lead) => lead.id}
    />
  );
}

/** The follow-up date: red when overdue, accent when it is today. */
export function NextAction({ lead, today }: { readonly lead: Lead; readonly today: string }) {
  const t = useTranslations('leads');
  const format = useFormatter();
  if (!isOpenLead(lead)) {
    return <span className="type-body-sm text-ink-faint">{t('closed')}</span>;
  }
  if (!lead.nextActionOn) {
    return <span className="type-body-sm text-ink-faint">{t('noNextAction')}</span>;
  }
  const isToday = lead.nextActionOn === today;
  const date = format.dateTime(new Date(lead.nextActionOn), { day: 'numeric', month: 'short' });
  return (
    <div className="flex min-w-0 flex-col items-end gap-0.5 md:items-start">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 type-body-sm font-medium',
          lead.overdue ? 'text-overdue' : isToday ? 'text-accent' : 'text-ink',
        )}
      >
        {(lead.overdue || isToday) && (
          <span
            aria-hidden
            className={cn('size-1.5 rounded-full', lead.overdue ? 'bg-overdue' : 'bg-accent')}
          />
        )}
        {lead.overdue ? t('overdueOn', { date }) : isToday ? t('today') : date}
      </span>
      {lead.nextActionNote && (
        <span className="max-w-[16rem] truncate type-body-sm text-ink-faint">
          {lead.nextActionNote}
        </span>
      )}
    </div>
  );
}
