'use client';

import type { Bonus } from '@oneohm/api-contracts';
import {
  Button,
  EmptyState,
  ResponsiveTable,
  Select,
  StatusPill,
  type TableColumn,
  useToast,
} from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { Check, Gift, Plus, Undo2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { describeError } from '@/lib/api/api-error';
import { useCan, useCurrentUser } from '@/providers/current-user';
import { DecideDialog, type DecisionTarget } from '../decide-dialog';
import { DECISION_TONE, useWorkforceFormat } from '../workforce-format';
import { BonusShares } from './bonus-shares';
import { ProposeBonusSheet } from './propose-bonus-sheet';
import { useBonusActions, useBonuses } from './use-bonuses';

type Status = 'all' | Bonus['status'];
const STATUSES = ['all', 'pending', 'approved', 'rejected', 'cancelled'] as const;

/**
 * Project bonuses and incentives (PRD 3.12, 4.7): proposed by people or project
 * managers, decided by whoever approves payments, then paid by finance.
 */
export function BonusesTab() {
  const t = useTranslations('team.bonuses');
  const statusT = useTranslations('team.leave.status');
  const me = useCurrentUser();
  const canPropose = useCan('people.manage', 'projects.manage');
  const canApprove = useCan('finance.approve_payments');
  const toast = useToast();
  const format = useWorkforceFormat();
  const query = useBonuses();
  const actions = useBonusActions();
  const [status, setStatus] = useState<Status>('pending');
  const [proposing, setProposing] = useState(false);
  const [deciding, setDeciding] = useState<{ bonus: Bonus; target: DecisionTarget } | null>(null);

  const withdraw = async (bonus: Bonus) => {
    try {
      await actions.cancel(bonus.id);
      toast({ title: t('withdrawn'), reference: bonus.reason, tone: 'success' });
    } catch (caught) {
      toast({ title: t('withdrawFailed'), description: describeError(caught), tone: 'error' });
    }
  };
  const startDecide = (bonus: Bonus, approve: boolean) =>
    setDeciding({
      bonus,
      target: {
        approve,
        title: bonus.reason,
        summary: (
          <p className="type-body-sm text-ink-muted">
            {t('decideSummary', { amount: formatInr(bonus.totalPaise) })}
          </p>
        ),
      },
    });

  const rows = (query.data ?? []).filter((bonus) => status === 'all' || bonus.status === status);
  const columns: readonly TableColumn<Bonus>[] = [
    {
      key: 'bonus',
      header: t('columns.bonus'),
      primary: true,
      cell: (bonus) => (
        <span className="flex min-w-0 flex-col">
          <span className="type-body font-medium text-ink">{bonus.reason}</span>
          <span className="type-body-sm text-ink-faint">
            {[bonus.project?.code, bonus.proposedBy?.fullName, format.ago(bonus.createdAt)]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      ),
    },
    { key: 'people', header: t('columns.people'), cell: (bonus) => <BonusShares bonus={bonus} /> },
    {
      key: 'total',
      header: t('columns.total'),
      align: 'end',
      cell: (bonus) => (
        <span className="font-mono text-[0.875rem] text-ink tabular-nums">
          {formatInr(bonus.totalPaise)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (bonus) => (
        <span className="inline-flex flex-col items-end gap-1 md:items-start">
          <StatusPill size="sm" tone={DECISION_TONE[bonus.status]} label={statusT(bonus.status)} />
          {bonus.decidedBy && (
            <span className="type-label text-ink-faint">{bonus.decidedBy.fullName}</span>
          )}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('columns.actions'),
      align: 'end',
      cell: (bonus) =>
        bonus.status === 'pending' ? (
          <span className="inline-flex flex-wrap justify-end gap-2">
            {(bonus.proposedBy?.id === me.id || canApprove) && (
              <Button
                size="sm"
                variant="quiet"
                leadingIcon={<Undo2 />}
                onClick={() => withdraw(bonus)}
              >
                {t('withdraw')}
              </Button>
            )}
            {canApprove && (
              <>
                <Button size="sm" leadingIcon={<X />} onClick={() => startDecide(bonus, false)}>
                  {t('decline')}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  leadingIcon={<Check />}
                  onClick={() => startDecide(bonus, true)}
                >
                  {t('approve')}
                </Button>
              </>
            )}
          </span>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="max-w-2xl type-body text-ink-muted sm:flex-1">{t('intro')}</p>
        <Select
          value={status}
          onValueChange={setStatus}
          label={t('statusLabel')}
          className="sm:w-48"
          options={STATUSES.map((value) => ({
            value,
            label: value === 'all' ? t('allStatuses') : statusT(value),
          }))}
        />
        {canPropose && (
          <Button
            variant="primary"
            leadingIcon={<Plus />}
            onClick={() => setProposing(true)}
            className="self-start sm:self-auto"
          >
            {t('proposeAction')}
          </Button>
        )}
      </div>
      {query.isPending && <ListSkeleton label={t('loading')} rows={3} />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
      {query.data && rows.length === 0 && <EmptyState icon={<Gift />} title={t('empty')} />}
      {rows.length > 0 && (
        <ResponsiveTable
          caption={t('caption')}
          columns={columns}
          rows={rows}
          rowKey={(bonus) => bonus.id}
        />
      )}
      {canPropose && <ProposeBonusSheet open={proposing} onOpenChange={setProposing} />}
      <DecideDialog
        target={deciding?.target ?? null}
        onClose={() => setDeciding(null)}
        onDecide={async (approve, note) => {
          if (!deciding) return;
          await actions.decide(deciding.bonus.id, approve, note);
          toast({
            title: approve ? t('approved') : t('declined'),
            reference: deciding.bonus.reason,
            tone: 'success',
          });
        }}
      />
    </div>
  );
}
