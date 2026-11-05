'use client';

import type { ProjectLoan } from '@oneohm/api-contracts';
import { Button, EmptyState } from '@oneohm/design-system/web';
import { Landmark } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { matchesSearch, useSearchParam } from '@/lib/use-search-param';
import { useCan } from '@/providers/current-user';
import { FinanceSearch } from '../finance-search';
import { useLoans } from '../use-finance';
import { DisbursementDialog } from './disbursement-dialog';
import { LendersDialog } from './lenders-dialog';
import { LoanCard } from './loan-card';
import { LoanSheet } from './loan-sheet';

/**
 * Bank-financed projects: documents, sanction, tranches and what the bank has paid. The
 * search (`?q=`) matches here; the open loan is `?loan=<projectId>`, so a link can open it.
 */
export function LoansTab() {
  const t = useTranslations('finance.loans');
  const canManageLoans = useCan('loans.manage');
  const canReceive = useCan('finance.record_payments');
  const canManage = canManageLoans || canReceive;
  const query = useLoans();
  const { draft, setDraft, search } = useSearchParam();
  const [loanId, setLoanId] = useLoanParam();
  const editing = canManage
    ? (query.data?.find((loan) => loan.projectId === loanId) ?? null)
    : null;
  const loans = (query.data ?? []).filter((loan) =>
    matchesSearch(search, [
      loan.customerName,
      loan.projectCode,
      loan.lenderName,
      loan.applicationNumber,
    ]),
  );
  const [receiving, setReceiving] = useState<ProjectLoan | null>(null);
  const [lenders, setLenders] = useState(false);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl type-body-sm text-ink-muted">{t('description')}</p>
        {canManage && (
          <Button variant="secondary" leadingIcon={<Landmark />} onClick={() => setLenders(true)}>
            {t('lenders')}
          </Button>
        )}
      </div>
      {(query.data?.length ?? 0) > 0 && (
        <FinanceSearch value={draft} onChange={setDraft} label={t('search')} />
      )}
      {query.isPending ? (
        <ListSkeleton label={t('loading')} rows={3} />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState icon={<Landmark />} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : loans.length === 0 ? (
        <EmptyState icon={<Landmark />} title={t('noMatchTitle')} description={t('noMatchBody')} />
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {loans.map((loan) => (
            <li key={loan.projectId}>
              <LoanCard
                loan={loan}
                {...(canManage ? { onEdit: () => setLoanId(loan.projectId) } : {})}
                {...(canReceive ? { onReceive: () => setReceiving(loan) } : {})}
              />
            </li>
          ))}
        </ul>
      )}
      <LoanSheet loan={editing} onClose={() => setLoanId(null)} />
      <DisbursementDialog loan={receiving} onClose={() => setReceiving(null)} />
      <LendersDialog open={lenders} onOpenChange={setLenders} />
    </section>
  );
}

/** The loan open in its sheet, by project id, kept in `?loan=`. */
function useLoanParam(): readonly [string | null, (id: string | null) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('loan', id);
    else next.delete('loan');
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ''}`, { scroll: false });
  };
  return [params.get('loan'), set];
}
