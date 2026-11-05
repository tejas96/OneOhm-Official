'use client';

import { Badge, Button, Card, CardHeader, EmptyState } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { BookOpen } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { matchesSearch, useSearchParam } from '@/lib/use-search-param';
import { FinanceSearch, withBareCodes } from '../finance-search';
import { useJournal } from '../use-finance';

/**
 * Every journal entry, newest first: what happened, and each debit and credit. The search
 * (`?q=`: JV number, memo or project code) runs on the server over the whole journal.
 */
export function JournalList() {
  const t = useTranslations('finance.ledger');
  const sourceT = useTranslations('finance.ledger.sources');
  const format = useFormatter();
  const { draft, setDraft, search } = useSearchParam();
  const query = useJournal(search);
  // Checked here too, so an API that ignores `q` still shows only matching entries.
  const entries = (query.data?.pages.flat() ?? []).filter((entry) =>
    matchesSearch(search, [
      entry.memo,
      `jv-${entry.number}`,
      `jv${entry.number}`,
      ...withBareCodes([entry.projectCode]),
    ]),
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader title={t('journal')} description={t('journalHint')} />
      <div className="px-5 pb-4">
        <FinanceSearch value={draft} onChange={setDraft} label={t('search')} />
      </div>
      {query.isPending ? (
        <div className="px-5 pb-5">
          <ListSkeleton label={t('loading')} rows={5} />
        </div>
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} className="m-5" />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title={search ? t('noMatch') : t('emptyJournal')}
          className="m-5"
        />
      ) : (
        <ol className="flex flex-col divide-y divide-hairline border-t border-hairline">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-2.5 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="flex flex-wrap items-center gap-2 font-mono text-[0.75rem] text-ink-faint">
                    JV-{entry.number} ·{' '}
                    {format.dateTime(new Date(`${entry.entryDate}T12:00:00`), {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                    <Badge variant="soft" className="font-sans">
                      {sourceT(entry.sourceType)}
                    </Badge>
                    {entry.reversedByNumber && (
                      <Badge variant="outline" className="font-sans">
                        {t('reversedBy', { number: entry.reversedByNumber })}
                      </Badge>
                    )}
                  </p>
                  <p className="type-body-sm text-ink">{entry.memo}</p>
                </div>
                {entry.postedBy && (
                  <span className="type-label text-ink-faint">{entry.postedBy.fullName}</span>
                )}
              </div>
              <table className="w-full type-label">
                <caption className="sr-only">{t('linesOf', { number: entry.number })}</caption>
                <tbody>
                  {entry.lines.map((line, index) => (
                    <tr key={`${line.accountCode}-${index}`}>
                      <th
                        scope="row"
                        className={`py-0.5 text-left font-normal text-ink-muted ${line.creditPaise > 0 ? 'pl-6' : ''}`}
                      >
                        {line.accountName}
                      </th>
                      <td className="w-28 py-0.5 text-right font-mono text-ink tabular-nums">
                        {line.debitPaise > 0 ? formatInr(line.debitPaise) : ''}
                      </td>
                      <td className="w-28 py-0.5 text-right font-mono text-ink tabular-nums">
                        {line.creditPaise > 0 ? formatInr(line.creditPaise) : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </li>
          ))}
        </ol>
      )}
      {query.hasNextPage && (
        <div className="border-t border-hairline px-5 py-3">
          <Button
            variant="quiet"
            pending={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {t('older')}
          </Button>
        </div>
      )}
    </Card>
  );
}
