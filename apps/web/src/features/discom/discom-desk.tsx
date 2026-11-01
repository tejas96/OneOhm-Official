'use client';

import type { DiscomDesk, DiscomDeskItem } from '@oneohm/api-contracts';
import { Badge, Button, cn, EmptyState, listItemEnter } from '@oneohm/design-system/web';
import { CalendarClock, CircleCheck, FileDigit, PhoneCall } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { FollowUpDialog } from './follow-up-dialog';

/** Waiting work per DISCOM, oldest first, with how long it has waited against the norm. */
export function DiscomDeskGroups({ desk }: { readonly desk: DiscomDesk }) {
  const t = useTranslations('discom.desk');
  const [editing, setEditing] = useState<DiscomDeskItem | null>(null);
  const groups = desk.groups.filter((group) => group.waiting.length > 0);
  if (groups.length === 0)
    return (
      <EmptyState icon={<CircleCheck />} title={t('emptyTitle')} description={t('emptyBody')} />
    );
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.discom?.id ?? 'none'} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline pb-2">
            <h2 className="type-title-lg text-ink [font-family:var(--font-display)]">
              {group.discom ? `${group.discom.code} · ${group.discom.name}` : t('noDiscom')}
            </h2>
            <p className="type-body-sm text-ink-muted">
              {group.averageWaitDays === null
                ? t('noAverage')
                : t('average', { days: group.averageWaitDays, expected: group.expectedDays })}
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-hairline">
            {group.waiting.map((item, index) => (
              <DeskRow
                key={item.id}
                item={item}
                index={index}
                onFollowUp={() => setEditing(item)}
              />
            ))}
          </ul>
        </section>
      ))}
      {editing && <FollowUpDialog item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DeskRow({
  item,
  index,
  onFollowUp,
}: {
  readonly item: DiscomDeskItem;
  readonly index: number;
  readonly onFollowUp: () => void;
}) {
  const t = useTranslations('discom.desk');
  const format = useFormatter();
  const late = item.ageDays > item.expectedDays;
  const share = Math.min(1, item.ageDays / Math.max(1, item.expectedDays));
  return (
    <motion.li
      {...listItemEnter(index)}
      className="grid grid-cols-1 gap-3 py-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-center"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 font-mono text-[0.75rem] text-ink-faint">
          {item.subject}
          {item.kind === 'change_request' && <Badge variant="accent">{t('changeRequest')}</Badge>}
        </p>
        <Link href={item.href} className="type-title-md text-ink hover:text-accent">
          {item.title}
        </Link>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 type-body-sm text-ink-muted">
          {item.referenceNumber && (
            <span className="inline-flex items-center gap-1 font-mono text-[0.8125rem]">
              <FileDigit aria-hidden className="size-3.5" />
              {item.referenceNumber}
            </span>
          )}
          {item.office && <span>{item.office}</span>}
          {item.assignee && <span>{item.assignee.fullName}</span>}
          {item.note && <span className="truncate text-ink-faint">{item.note}</span>}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={cn('type-body-sm tabular-nums', late ? 'text-overdue' : 'text-ink')}>
          {t('age', { days: item.ageDays, expected: item.expectedDays })}
        </span>
        <span className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
          <span
            className={cn('block h-full rounded-full', late ? 'bg-overdue' : 'bg-waiting-solid')}
            style={{ width: `${share * 100}%` }}
          />
        </span>
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        {item.nextFollowUpOn && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 type-label',
              item.followUpDue ? 'bg-at-risk-tint text-at-risk' : 'bg-sunken text-ink-muted',
            )}
          >
            <CalendarClock aria-hidden className="size-3.5" />
            {format.dateTime(new Date(item.nextFollowUpOn), { day: 'numeric', month: 'short' })}
          </span>
        )}
        {item.kind === 'task' ? (
          <Button size="sm" variant="secondary" leadingIcon={<PhoneCall />} onClick={onFollowUp}>
            {t('followUp')}
          </Button>
        ) : (
          <Button asChild size="sm" variant="secondary">
            <Link href={item.href}>{t('open')}</Link>
          </Button>
        )}
      </div>
    </motion.li>
  );
}
