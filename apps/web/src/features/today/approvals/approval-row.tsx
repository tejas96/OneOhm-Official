'use client';

import type { ApprovalItem } from '@oneohm/api-contracts';
import { Badge, Button, StatusPill } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { ArrowUpRight, Check } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { approvesInPlace } from './approve-item';

/** One waiting item: what it is, who asked and when, with Approve and Open. */
export function ApprovalRow({
  item,
  pending,
  onApprove,
}: {
  readonly item: ApprovalItem;
  readonly pending: boolean;
  readonly onApprove: (item: ApprovalItem) => void;
}) {
  const t = useTranslations('today.approvals');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const asked = new Date(item.requestedAt);
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t(`kinds.${item.kind}`)}</Badge>
          {item.projectCode && (
            <span className="font-mono text-[0.8125rem] text-ink-faint">{item.projectCode}</span>
          )}
          {item.overdue && <StatusPill size="sm" tone="overdue" label={t('waitingLong')} />}
        </div>
        <p className="type-body font-medium break-words text-ink">{item.subject}</p>
        <p className="type-body-sm text-ink-muted">
          {item.requesterName
            ? t(item.kind === 'assignee_confirm' ? 'proposed' : 'askedBy', {
                name: item.requesterName,
                when: format.relativeTime(asked, now),
              })
            : t('asked', { when: format.relativeTime(asked, now) })}
          {item.amountPaise !== null && (
            <span className="ml-2 font-medium text-ink tabular-nums">
              {formatInr(item.amountPaise)}
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="quiet" size="sm" asChild>
          <Link href={item.href}>
            {t('open')}
            <ArrowUpRight aria-hidden />
          </Link>
        </Button>
        {approvesInPlace(item) && (
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<Check />}
            pending={pending}
            onClick={() => onApprove(item)}
          >
            {t('approve')}
          </Button>
        )}
      </div>
    </li>
  );
}
