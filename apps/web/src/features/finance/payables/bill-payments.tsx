'use client';

import type { Payable, PayablePayment } from '@oneohm/api-contracts';
import { Badge, Button } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { Undo2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { UndoPaymentDialog } from './undo-payment-dialog';
import { useBillPayments } from './use-bill-payments';

/**
 * "Payments on this bill": each part paid, by hand or by bank, with who recorded it. A
 * payment recorded by hand can be undone by someone who may; a bank transfer cannot.
 * Shows nothing for a bill with no payments yet.
 */
export function BillPayments({
  bill,
  bare = false,
}: {
  readonly bill: Pick<Payable, 'id' | 'paidPaise'>;
  /** Alone in its own dialog: no rule above it. */
  readonly bare?: boolean;
}) {
  const t = useTranslations('finance.payables.payments');
  const methodT = useTranslations('finance.methods');
  const format = useFormatter();
  const query = useBillPayments(bill.id);
  const [undoing, setUndoing] = useState<PayablePayment | null>(null);

  if (query.isPending)
    return bill.paidPaise > 0 ? <ListSkeleton label={t('loading')} rows={2} /> : null;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  if (query.data.length === 0) return null;

  const day = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00`), { day: 'numeric', month: 'short' });

  return (
    <section
      aria-label={t('title')}
      className={
        bare ? 'flex flex-col gap-2' : 'mt-5 flex flex-col gap-2 border-t border-hairline pt-4'
      }
    >
      {!bare && <h3 className="type-body font-medium text-ink">{t('title')}</h3>}
      <ul className="flex flex-col gap-2">
        {query.data.map((payment) => (
          <li
            key={payment.id}
            className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-sunken px-3 py-2.5"
          >
            <div className="flex min-w-0 flex-col gap-0.5 type-body-sm">
              <span className={payment.reversed ? 'text-ink-faint line-through' : 'text-ink'}>
                <span className="font-mono font-medium tabular-nums">
                  {formatInr(payment.amountPaise)}
                </span>{' '}
                · {methodT(payment.method)} · {day(payment.paidOn)}
              </span>
              <span className="break-words text-ink-faint">
                {[payment.reference, payment.paidBy ?? (payment.bank ? t('byBank') : null)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {payment.reversed && (
                <span className="text-ink-muted">
                  {t('undoneBecause', { reason: payment.reversalReason ?? '' })}
                </span>
              )}
              {payment.bank && !payment.reversed && (
                <span className="text-ink-faint">{t('bankNote')}</span>
              )}
            </div>
            {payment.reversed ? (
              <Badge variant="soft">{t('undone')}</Badge>
            ) : (
              payment.canUndo && (
                <Button
                  size="sm"
                  variant="secondary"
                  leadingIcon={<Undo2 />}
                  onClick={() => setUndoing(payment)}
                >
                  {t('undoButton')}
                </Button>
              )
            )}
          </li>
        ))}
      </ul>
      <UndoPaymentDialog billId={bill.id} payment={undoing} onClose={() => setUndoing(null)} />
    </section>
  );
}
