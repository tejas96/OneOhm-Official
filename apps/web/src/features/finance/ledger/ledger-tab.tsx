'use client';

import { Card, CardHeader, StatusPill } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useTrialBalance } from '../use-finance';
import { JournalList } from './journal-list';

const amount = (paise: number) => (paise === 0 ? '—' : formatInr(paise));

/** The books: every account's totals (debits always equal credits) and the journal. */
export function LedgerTab() {
  const t = useTranslations('finance.ledger');
  const typeT = useTranslations('finance.ledger.types');
  const query = useTrialBalance();

  return (
    <div className="grid gap-6 xl:grid-cols-12">
      <Card className="self-start overflow-hidden xl:col-span-5">
        <CardHeader
          title={t('trialBalance')}
          description={query.data ? t('entries', { count: query.data.entries }) : undefined}
          action={
            query.data && (
              <StatusPill
                size="sm"
                tone={query.data.balanced ? 'done' : 'overdue'}
                label={query.data.balanced ? t('balanced') : t('unbalanced')}
              />
            )
          }
        />
        {query.isPending ? (
          <div className="px-5 pb-5">
            <ListSkeleton label={t('loading')} rows={6} />
          </div>
        ) : query.isError ? (
          <LoadError error={query.error} onRetry={() => query.refetch()} className="m-5" />
        ) : (
          <table className="w-full type-body-sm">
            <caption className="sr-only">{t('trialBalance')}</caption>
            <thead className="border-y border-hairline bg-surface">
              <tr className="text-left type-label text-ink-faint">
                <th scope="col" className="px-5 py-2 font-medium">
                  {t('account')}
                </th>
                <th scope="col" className="px-2 py-2 text-right font-medium">
                  {t('debit')}
                </th>
                <th scope="col" className="px-5 py-2 text-right font-medium">
                  {t('credit')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {query.data.accounts.map((account) => (
                <tr key={account.code}>
                  <th scope="row" className="px-5 py-2.5 text-left font-normal">
                    <span className="flex flex-col">
                      <span className="text-ink">{account.name}</span>
                      <span className="font-mono text-[0.6875rem] text-ink-faint">
                        {account.code} · {typeT(account.type)}
                      </span>
                    </span>
                  </th>
                  <td className="px-2 py-2.5 text-right font-mono text-ink tabular-nums">
                    {amount(account.debitPaise)}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono text-ink tabular-nums">
                    {amount(account.creditPaise)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-rule">
              <tr className="font-medium">
                <th scope="row" className="px-5 py-3 text-left text-ink">
                  {t('total')}
                </th>
                <td className="px-2 py-3 text-right font-mono text-ink tabular-nums">
                  {formatInr(query.data.totalDebitPaise)}
                </td>
                <td className="px-5 py-3 text-right font-mono text-ink tabular-nums">
                  {formatInr(query.data.totalCreditPaise)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </Card>
      <div className="xl:col-span-7">
        <JournalList />
      </div>
    </div>
  );
}
