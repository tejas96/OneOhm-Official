'use client';

import type { ProjectLoan } from '@oneohm/api-contracts';
import { Button, EmptyState } from '@oneohm/design-system/web';
import { Landmark } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useCan } from '@/providers/current-user';
import { useLoans } from '../use-finance';
import { DisbursementDialog } from './disbursement-dialog';
import { LendersDialog } from './lenders-dialog';
import { LoanCard } from './loan-card';
import { LoanSheet } from './loan-sheet';

/** Bank-financed projects: documents, sanction, tranches and what the bank has paid. */
export function LoansTab() {
  const t = useTranslations('finance.loans');
  const canManageLoans = useCan('loans.manage');
  const canReceive = useCan('finance.record_payments');
  const canManage = canManageLoans || canReceive;
  const query = useLoans();
  const [editing, setEditing] = useState<ProjectLoan | null>(null);
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
      {query.isPending ? (
        <ListSkeleton label={t('loading')} rows={3} />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState icon={<Landmark />} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {query.data.map((loan) => (
            <li key={loan.projectId}>
              <LoanCard
                loan={loan}
                {...(canManage ? { onEdit: () => setEditing(loan) } : {})}
                {...(canReceive ? { onReceive: () => setReceiving(loan) } : {})}
              />
            </li>
          ))}
        </ul>
      )}
      <LoanSheet loan={editing} onClose={() => setEditing(null)} />
      <DisbursementDialog loan={receiving} onClose={() => setReceiving(null)} />
      <LendersDialog open={lenders} onOpenChange={setLenders} />
    </section>
  );
}
