'use client';

import type { CommissionRule, ResellerPerformance } from '@oneohm/api-contracts';
import { Button, Card, EmptyState } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { Handshake, PencilLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useCan } from '@/providers/current-user';
import { PerformanceTable } from './performance-table';
import { RuleSheet } from './rule-sheet';
import { ruleSummary } from './rule-summary';
import { type RuleTarget, useDefaultCommissionRule, useResellerPerformance } from './use-resellers';

type Editing = { target: RuleTarget; rule: CommissionRule; custom: boolean };

/** Reseller performance and commission rules (PRD 3.3, 4.8). Payouts live in Finance. */
export function ResellersTab() {
  const t = useTranslations('team.resellers');
  const canConfigure = useCan('settings.manage');
  const performance = useResellerPerformance();
  const defaultRule = useDefaultCommissionRule();
  const [editing, setEditing] = useState<Editing | null>(null);
  const rows = performance.data ?? [];
  const sum = (pick: (row: ResellerPerformance) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);

  const editReseller = (row: ResellerPerformance) =>
    setEditing({
      target: { id: row.reseller.id, fullName: row.reseller.fullName },
      rule: row.rule,
      custom: row.customRule,
    });

  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-3 p-5">
          <p className="type-overline text-ink-faint uppercase">{t('defaultTitle')}</p>
          {defaultRule.data ? (
            <p className="type-title-md text-ink">{ruleSummary(t, defaultRule.data)}</p>
          ) : (
            <p className="type-body-sm text-ink-faint">{t('loadingRule')}</p>
          )}
          <p className="type-body-sm text-ink-faint">{t('defaultHint')}</p>
          {canConfigure && defaultRule.data && (
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<PencilLine />}
              className="self-start"
              onClick={() =>
                defaultRule.data &&
                setEditing({ target: null, rule: defaultRule.data, custom: false })
              }
            >
              {t('editDefault')}
            </Button>
          )}
        </Card>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline">
          {[
            ['resellers', String(rows.length)],
            ['valueSold', formatInr(sum((row) => row.valueSoldPaise))],
            ['toApprove', formatInr(sum((row) => row.totals.pendingPaise))],
            ['toPay', formatInr(sum((row) => row.totals.approvedPaise))],
          ].map(([key, value]) => (
            <div key={key} className="flex flex-col gap-1 bg-surface px-4 py-4">
              <dt className="type-label text-ink-faint">{t(`stats.${key}`)}</dt>
              <dd className="font-mono type-title-md text-ink tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {performance.isPending ? (
        <ListSkeleton label={t('loading')} />
      ) : performance.isError ? (
        <LoadError error={performance.error} onRetry={() => performance.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Handshake />} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : (
        <PerformanceTable rows={rows} canConfigure={canConfigure} onEditRule={editReseller} />
      )}
      <RuleSheet editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
