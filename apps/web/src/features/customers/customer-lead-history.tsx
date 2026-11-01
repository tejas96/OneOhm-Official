'use client';

import type { CustomerLeadEntry } from '@oneohm/api-contracts';
import { Badge, Button, Card, CardHeader, cn } from '@oneohm/design-system/web';
import {
  CalendarClock,
  type LucideIcon,
  MapPin,
  MessageCircle,
  MoveRight,
  NotebookPen,
  PhoneCall,
} from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';

const FIRST = 8;

const KIND_ICON: Readonly<Record<CustomerLeadEntry['kind'], LucideIcon>> = {
  note: NotebookPen,
  call: PhoneCall,
  visit: MapPin,
  whatsapp: MessageCircle,
  stage_change: MoveRight,
  follow_up: CalendarClock,
};

const KIND_DISC: Readonly<Record<CustomerLeadEntry['kind'], string>> = {
  note: 'bg-sunken text-ink-muted',
  call: 'bg-accent-soft text-accent',
  visit: 'bg-energy-soft text-on-track',
  whatsapp: 'bg-on-track-tint text-on-track',
  stage_change: 'bg-review-tint text-review',
  follow_up: 'bg-waiting-tint text-waiting',
};

/** Calls, visits, notes and follow-ups from the customer's leads (PRD 3.2), newest first. */
export function CustomerLeadHistory({
  entries,
}: {
  readonly entries: readonly CustomerLeadEntry[];
}) {
  const t = useTranslations('customers.conversations');
  const [all, setAll] = useState(false);
  const shown = all ? entries : entries.slice(0, FIRST);
  return (
    <Card className="min-w-0">
      <CardHeader title={t('leadTitle')} description={t('leadBody')} />
      {entries.length === 0 ? (
        <p className="border-t border-hairline px-5 py-4 type-body-sm text-ink-faint">
          {t('leadNone')}
        </p>
      ) : (
        <ol className="flex flex-col divide-y divide-hairline border-t border-hairline">
          {shown.map((entry) => (
            <Entry key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
      {entries.length > FIRST && (
        <div className="border-t border-hairline px-3 py-2">
          <Button variant="quiet" size="sm" onClick={() => setAll((current) => !current)}>
            {all ? t('showFewer') : t('showAll', { count: entries.length })}
          </Button>
        </div>
      )}
    </Card>
  );
}

function Entry({ entry }: { readonly entry: CustomerLeadEntry }) {
  const t = useTranslations('customers.conversations');
  const format = useFormatter();
  const Icon = KIND_ICON[entry.kind];
  return (
    <li className="flex gap-3 px-5 py-3.5">
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          KIND_DISC[entry.kind],
        )}
      >
        <Icon aria-hidden className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-label text-ink-faint">
          <span className="font-medium text-ink-muted">{t(`leadKind.${entry.kind}`)}</span>
          <span aria-hidden>·</span>
          <time dateTime={entry.createdAt}>
            {format.dateTime(new Date(entry.createdAt), {
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </time>
          {entry.user && (
            <>
              <span aria-hidden>·</span>
              <span>{entry.user.fullName}</span>
            </>
          )}
          {entry.internal && <Badge variant="soft">{t('staffOnly')}</Badge>}
        </p>
        <p className="type-body-sm whitespace-pre-line text-ink">{entry.note}</p>
        <Link
          href={`/leads/${entry.lead.id}`}
          className="self-start type-label text-ink-muted underline-offset-4 hover:text-accent hover:underline"
        >
          {entry.lead.name}
        </Link>
      </div>
    </li>
  );
}
