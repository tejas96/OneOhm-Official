'use client';

import type { MonthSheetPerson } from '@oneohm/api-contracts';
import { StatusPill } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMonthFormat } from './month-format';
import { claimHref, leaveHref } from './month-links';

const Row = ({
  children,
  href,
}: {
  readonly children: React.ReactNode;
  readonly href?: string;
}) => {
  const body = (
    <span className="flex items-center justify-between gap-3 type-body-sm text-ink">
      {children}
    </span>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="block rounded-md px-1 py-1.5 hover:bg-sunken">
          {body}
        </Link>
      ) : (
        <span className="block px-1 py-1.5">{body}</span>
      )}
    </li>
  );
};

/** The records behind the money and the leave: claims, bonuses and leave, each opening itself. */
export function ItemsList({ items }: { readonly items: MonthSheetPerson['items'] }) {
  const t = useTranslations('team.monthSheet.items');
  const words = useMonthFormat();
  const empty = !items.claims.length && !items.bonuses.length && !items.leaves.length;
  if (empty) return <p className="type-body-sm text-ink-faint">{t('none')}</p>;
  return (
    <div className="flex flex-col gap-4">
      {items.claims.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="type-label font-medium text-ink-faint">{t('claims')}</h4>
          <ul>
            {items.claims.map((claim) => (
              <Row key={claim.id} href={claimHref(claim.id)}>
                <span>{words.shortDay(claim.workDate)}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{formatInr(claim.amountPaise)}</span>
                  <StatusPill
                    size="sm"
                    tone={
                      claim.paid ? 'onTrack' : claim.status === 'approved' ? 'waiting' : 'atRisk'
                    }
                    label={t(
                      claim.paid
                        ? 'paid'
                        : claim.status === 'approved'
                          ? 'approvedUnpaid'
                          : 'waiting',
                    )}
                  />
                </span>
              </Row>
            ))}
          </ul>
        </section>
      )}
      {items.bonuses.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="type-label font-medium text-ink-faint">{t('bonuses')}</h4>
          <ul>
            {items.bonuses.map((bonus) => (
              <Row key={bonus.id} href={`/team?tab=bonuses&bonus=${bonus.id}`}>
                <span className="min-w-0 truncate">
                  {bonus.reason} · {words.shortDay(bonus.approvedOn)}
                </span>
                <span className="tabular-nums">{formatInr(bonus.amountPaise)}</span>
              </Row>
            ))}
          </ul>
        </section>
      )}
      {items.leaves.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="type-label font-medium text-ink-faint">{t('leaves')}</h4>
          <ul>
            {items.leaves.map((leave) => (
              <Row key={leave.id} href={leaveHref(leave.id)}>
                <span className="min-w-0 truncate">
                  {leave.label}
                  {leave.halfDay ? ` (${t('half')})` : ''} ·{' '}
                  {leave.fromDate === leave.toDate
                    ? words.shortDay(leave.fromDate)
                    : `${words.shortDay(leave.fromDate)} – ${words.shortDay(leave.toDate)}`}
                </span>
                <span className="flex items-center gap-2">
                  {!leave.paid && <StatusPill size="sm" tone="neutral" label={t('unpaid')} />}
                  <StatusPill
                    size="sm"
                    tone={leave.status === 'approved' ? 'onTrack' : 'atRisk'}
                    label={t(leave.status)}
                  />
                </span>
              </Row>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
