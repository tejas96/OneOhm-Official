'use client';

import { Button } from '@oneohm/design-system/web';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePayoutMatch } from './use-payout-match';

const DAYS = 30;

/** "Check against RazorpayX": all agree, or each difference with a link to its bill. */
export function PayoutMatchPanel() {
  const t = useTranslations('settings.bankTransfers.match');
  const match = usePayoutMatch();
  const report = match.data;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          pending={match.isPending}
          onClick={() => match.mutate(DAYS)}
        >
          {t('button')}
        </Button>
        <span className="type-body-sm text-ink-muted">{t('hint', { days: DAYS })}</span>
      </div>
      {match.isError && (
        <p role="alert" className="type-body-sm text-at-risk">
          {t('failed')}
        </p>
      )}
      {report && report.lines.length === 0 && (
        <p role="status" className="rounded-md bg-on-track-tint px-3 py-2.5 type-body-sm text-ink">
          {report.practice
            ? t('practice', { count: report.matched })
            : t('allMatch', { count: report.matched })}
        </p>
      )}
      {report && report.lines.length > 0 && (
        <div role="status" className="flex flex-col gap-2">
          <p className="type-label text-ink">
            {t('differences', { count: report.lines.length, matched: report.matched })}
          </p>
          <ul className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
            {report.lines.map((line) => (
              <li
                key={`${line.kind}:${line.payableId ?? ''}:${line.text}`}
                className="px-3 py-2 type-body-sm text-ink"
              >
                {line.payableId ? (
                  <Link
                    href={`/finance?tab=payables&bill=${line.payableId}`}
                    className="underline underline-offset-2"
                  >
                    {line.text}
                  </Link>
                ) : (
                  line.text
                )}
              </li>
            ))}
          </ul>
          {report.truncated && <p className="type-body-sm text-ink-faint">{t('truncated')}</p>}
        </div>
      )}
    </div>
  );
}
