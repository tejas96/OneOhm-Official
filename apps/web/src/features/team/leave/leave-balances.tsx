'use client';

import type { LeaveBalance } from '@oneohm/api-contracts';
import { listItemEnter, ProgressRing } from '@oneohm/design-system/web';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { daysOf } from '../workforce-format';

/** One ring per kind of leave: the arc is what is used or booked, the number what is left. */
export function LeaveBalances({ balances }: { readonly balances: readonly LeaveBalance[] }) {
  const t = useTranslations('team.leave.balances');
  if (balances.length === 0) return null;
  return (
    <ul aria-label={t('label')} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
      {balances.map((balance, index) => {
        const booked = balance.usedHalfDays + balance.pendingHalfDays;
        const left = Math.max(0, balance.allowedHalfDays - booked);
        return (
          <motion.li
            key={balance.leaveType}
            {...listItemEnter(index)}
            className="flex items-center gap-4 rounded-lg border border-hairline bg-raised p-4"
          >
            <ProgressRing
              value={balance.allowedHalfDays ? booked / balance.allowedHalfDays : 0}
              label={t('ring', {
                booked: daysOf(booked),
                allowed: daysOf(balance.allowedHalfDays),
              })}
              size={56}
              thickness={4}
              toneClassName="text-accent"
            >
              <span className="type-title-lg text-ink tabular-nums [font-family:var(--font-display)]">
                {daysOf(left)}
              </span>
            </ProgressRing>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="type-title-md break-words text-ink">{balance.label}</p>
              <p className="type-body-sm text-ink-muted">
                {t('left', { count: daysOf(left), allowed: daysOf(balance.allowedHalfDays) })}
              </p>
              {balance.pendingHalfDays > 0 && (
                <p className="type-body-sm text-ink-faint">
                  {t('waiting', { count: daysOf(balance.pendingHalfDays) })}
                </p>
              )}
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}
