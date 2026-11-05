'use client';

import type { ApprovalItem } from '@oneohm/api-contracts';
import { cn, EmptyState, useToast } from '@oneohm/design-system/web';
import { type UseQueryResult, useQueryClient } from '@tanstack/react-query';
import { CircleCheckBig } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { describeError } from '@/lib/api/api-error';
import { ApprovalRow } from './approval-row';
import { approveItem } from './approve-item';
import { DeclineSendDialog } from './decline-send-dialog';

/**
 * Everything this person may say yes to, oldest first (PRD 7.1): task reviews,
 * discounts, leave, claims, purchase requests, bills, bonuses and payouts. `?kind=`
 * narrows it, so the command centre can link straight to one kind.
 */
export function ApprovalsInbox({ query }: { readonly query: UseQueryResult<ApprovalItem[]> }) {
  const t = useTranslations('today.approvals');
  const toast = useToast();
  const client = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<ApprovalItem | null>(null);
  const wanted = (params.get('kind') ?? '').split(',').filter(Boolean);
  const items = query.data ?? [];
  const shown = wanted.length ? items.filter((item) => wanted.includes(item.kind)) : items;
  const kinds = [...new Set(items.map((item) => item.kind))];

  const filter = (kind: string | null) => {
    const next = new URLSearchParams(params);
    if (kind) next.set('kind', kind);
    else next.delete('kind');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const approve = async (item: ApprovalItem) => {
    setBusy(item.id);
    try {
      await approveItem(item);
      toast({
        title: t(item.kind === 'bank_payout' ? 'sentToBank' : 'approved'),
        reference: item.subject,
        tone: 'success',
      });
      await client.invalidateQueries();
    } catch (error) {
      toast({ title: describeError(error), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  if (query.isPending) return <ListSkeleton label={t('loading')} />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  if (items.length === 0)
    return (
      <EmptyState icon={<CircleCheckBig />} title={t('emptyTitle')} description={t('emptyBody')} />
    );

  const chip = (active: boolean) =>
    cn(
      'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 type-body-sm ring-1 transition-colors',
      active
        ? 'bg-accent-soft text-on-accent-soft ring-accent/40'
        : 'bg-raised text-ink-muted ring-hairline/70 hover:text-ink',
    );
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label={t('filter')} className="flex flex-wrap gap-2">
        <button type="button" className={chip(wanted.length === 0)} onClick={() => filter(null)}>
          {t('all')}
          <span className="font-mono">{items.length}</span>
        </button>
        {kinds.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={wanted.includes(kind)}
            className={chip(wanted.includes(kind))}
            onClick={() => filter(kind)}
          >
            {t(`kinds.${kind}`)}
            <span className="font-mono">{items.filter((item) => item.kind === kind).length}</span>
          </button>
        ))}
      </nav>
      {shown.length === 0 ? (
        <p className="py-4 type-body-sm text-ink-faint">{t('noneOfKind')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {shown.map((item) => (
            <ApprovalRow
              key={`${item.kind}:${item.id}`}
              item={item}
              pending={busy === item.id}
              onApprove={approve}
              onDecline={setDeclining}
            />
          ))}
        </ul>
      )}
      <DeclineSendDialog item={declining} onClose={() => setDeclining(null)} />
    </div>
  );
}
