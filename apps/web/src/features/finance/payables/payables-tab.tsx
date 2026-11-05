'use client';

import type { Payable } from '@oneohm/api-contracts';
import {
  Button,
  EmptyState,
  Input,
  ResponsiveTable,
  SegmentedControl,
  type TableColumn,
} from '@oneohm/design-system/web';
import { ClipboardCheck, Plus, ReceiptIndianRupee, Search, Wallet } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useMayDecide } from '@/features/today/approvals/use-my-approvals';
import { useFocusRow } from '@/lib/use-focus-row';
import { matchesSearch, useSearchParam } from '@/lib/use-search-param';
import { useCan } from '@/providers/current-user';
import { type PayableFilter, usePayables } from '../use-finance';
import { AddBillDialog } from './add-bill-dialog';
import { BillStatusPill } from './bank/bill-status-pill';
import { LowBalanceBanner } from './bank/low-balance-banner';
import { latestByBill } from './bank/payout-status';
import { useRecentPayouts } from './bank/use-payouts';
import { BillAmount } from './bill-amount';
import { BillPaymentsDialog } from './bill-payments-dialog';
import { PayBillDialog } from './pay-bill-dialog';
import { ReviewBillSheet } from './review-bill-sheet';

const FILTERS = ['open', 'pending', 'approved', 'paid', 'all'] as const;

/** The chosen status lives in `?filter=`, so "bills to approve" opens exactly those bills. */
function useBillFilter(): readonly [PayableFilter, (next: PayableFilter) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const asked = params.get('filter');
  const filter = FILTERS.find((candidate) => candidate === asked) ?? 'open';
  const set = (next: PayableFilter) => {
    const search = new URLSearchParams(params);
    if (next === 'open') search.delete('filter');
    else search.set('filter', next);
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
  };
  return [filter, set];
}

/**
 * Bills from vendors and crews: review (vendor invoice, TDS), approve, then pay.
 * Approval books the cost and the TDS held. `?bill=<id>` opens one bill (an approval's
 * "Open"), with `&pay=1` the pay dialog too (a contractor's "Pay" link); `?q=` searches by vendor, bill number, project or what it is for.
 */
export function PayablesTab() {
  const t = useTranslations('finance.payables');
  const methodT = useTranslations('finance.methods');
  const format = useFormatter();
  const canAdd = useCan('finance.record_payments');
  const canApprove = useCan('finance.approve_payments');
  const [filter, setFilter] = useBillFilter();
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<Payable | null>(null);
  const [viewing, setViewing] = useState<Payable | null>(null);
  const [reviewing, setReviewing] = useState<Payable | null>(null);
  const query = usePayables(filter);
  const payouts = latestByBill(useRecentPayouts().data ?? []);
  const { draft, setDraft, search } = useSearchParam();
  // Within the limit in Settings, accounts may approve a bill too; the inbox knows which.
  const mayDecide = useMayDecide('bill');
  const mayApprove = (bill: Payable) => canApprove || mayDecide.has(bill.id);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const wantsPay = params.get('pay') === '1';
  const focused = useFocusRow('bill', query.data, (bill) => {
    if (bill.status === 'pending' && (canAdd || mayApprove(bill))) setReviewing(bill);
    if (bill.status === 'approved' && canAdd && wantsPay) setPaying(bill);
  });
  // `pay=1` is a one-time nudge: drop it once `bill` has been handled.
  useEffect(() => {
    if (!wantsPay || params.get('bill')) return;
    const next = new URLSearchParams(params);
    next.delete('pay');
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ''}`, { scroll: false });
  }, [wantsPay, params, pathname, router]);
  // The dialog stays open on the bill while it is paid; show the newest figures of that bill.
  const payingNow = paying ? (query.data?.find((bill) => bill.id === paying.id) ?? paying) : null;
  const rows = (query.data ?? []).filter((bill) =>
    matchesSearch(search, [bill.partyName, bill.description, bill.billNumber, bill.projectCode]),
  );

  const date = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00`), { day: 'numeric', month: 'short' });

  const columns: TableColumn<Payable>[] = [
    {
      key: 'party',
      header: t('columns.party'),
      primary: true,
      cell: (bill) => (
        <span className="flex flex-col">
          <span className="type-body font-medium text-ink">{bill.partyName}</span>
          <span className="type-label text-ink-faint">{t(`party.${bill.party}`)}</span>
        </span>
      ),
    },
    {
      key: 'for',
      header: t('columns.for'),
      cell: (bill) => (
        <span className="flex flex-col type-body-sm">
          <span className="text-ink-muted">{bill.description}</span>
          <span className="font-mono text-[0.75rem] text-ink-faint">
            {[bill.projectCode, bill.billNumber].filter(Boolean).join(' · ')}
          </span>
        </span>
      ),
    },
    {
      key: 'amount',
      header: t('columns.amount'),
      align: 'end',
      cell: (bill) => <BillAmount bill={bill} />,
    },
    {
      key: 'due',
      header: t('columns.due'),
      cell: (bill) =>
        bill.status === 'paid' && bill.paidOn ? (
          <span className="flex flex-col type-body-sm">
            <span className="text-ink">{t('paidOn', { date: date(bill.paidOn) })}</span>
            <span className="text-ink-faint">
              {[bill.paidMethod && methodT(bill.paidMethod), bill.paidReference]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        ) : (
          <span className={bill.overdue ? 'type-body-sm text-overdue' : 'type-body-sm text-ink'}>
            {bill.overdue ? t('overdueSince', { date: date(bill.dueOn) }) : date(bill.dueOn)}
          </span>
        ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (bill) => (
        <span className="flex flex-wrap items-center gap-2">
          <BillStatusPill bill={bill} latest={payouts.get(bill.id)} />
          {bill.status === 'pending' && (mayApprove(bill) || canAdd) && (
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<ClipboardCheck />}
              onClick={() => setReviewing(bill)}
            >
              {mayApprove(bill) ? t('approve') : t('review.title')}
            </Button>
          )}
          {bill.paidPaise > 0 && (
            <Button size="sm" variant="quiet" onClick={() => setViewing(bill)}>
              {t('payments.open')}
            </Button>
          )}
          {bill.status === 'approved' && canAdd && (
            <Button
              size="sm"
              variant="primary"
              leadingIcon={<Wallet />}
              onClick={() => setPaying(bill)}
            >
              {t('pay')}
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <SegmentedControl
            value={filter}
            onValueChange={setFilter}
            label={t('filterLabel')}
            size="sm"
            options={FILTERS.map((value) => ({ value, label: t(`filters.${value}`) }))}
          />
          <div className="w-full min-w-0 sm:w-72">
            <Input
              type="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t('search')}
              aria-label={t('search')}
              leading={<Search aria-hidden />}
            />
          </div>
        </div>
        {canAdd && (
          <Button variant="primary" leadingIcon={<Plus />} onClick={() => setAdding(true)}>
            {t('add')}
          </Button>
        )}
      </div>
      <LowBalanceBanner />
      {query.isPending ? (
        <ListSkeleton label={t('loading')} />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={<ReceiptIndianRupee />}
          title={t('emptyTitle')}
          description={t('emptyBody')}
        />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Search />} title={t('noMatchTitle')} description={t('noMatchBody')} />
      ) : (
        <ResponsiveTable
          caption={t('caption')}
          columns={columns}
          rows={rows}
          rowKey={(bill) => bill.id}
          focusedKey={focused}
        />
      )}
      <AddBillDialog open={adding} onOpenChange={setAdding} />
      <PayBillDialog bill={payingNow} onClose={() => setPaying(null)} />
      <BillPaymentsDialog
        bill={viewing ? (query.data?.find((bill) => bill.id === viewing.id) ?? viewing) : null}
        onClose={() => setViewing(null)}
      />
      <ReviewBillSheet
        bill={reviewing}
        mayApprove={reviewing !== null && mayApprove(reviewing)}
        onClose={() => setReviewing(null)}
      />
    </section>
  );
}
