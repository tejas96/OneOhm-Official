'use client';

import type { CustomerMoneyEntry, ProjectDetail } from '@oneohm/api-contracts';
import { formatInr } from '@oneohm/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useProjectBilling } from '@/features/finance/billing/use-billing';
import { useCan } from '@/providers/current-user';

type Payment = ProjectDetail['payments'][number];
type Item =
  | { readonly key: string; readonly date: string; readonly payment: Payment }
  | { readonly key: string; readonly date: string; readonly refund: CustomerMoneyEntry };

/** What a row prints: a refund is money out, with its reason in place of a reference. */
function describe(item: Item) {
  if ('refund' in item) {
    const { refund } = item;
    return { method: refund.method, reference: refund.reason, amount: -refund.amountPaise };
  }
  const { payment } = item;
  return { method: payment.method, reference: payment.reference, amount: payment.amountPaise };
}

/**
 * Money received on the project, with refunds paid back. A refund of milestone money
 * adds a negative payment row; that row is shown as its refund, not twice.
 */
export function PaymentHistory({ project }: { readonly project: ProjectDetail }) {
  const t = useTranslations('projects.money');
  const methodT = useTranslations('projects.money.methods');
  const format = useFormatter();
  const canView = useCan('finance.view');
  const canRecord = useCan('finance.record_payments');
  const billing = useProjectBilling(project.id, canView || canRecord);
  const entries = billing.data?.entries ?? [];
  const releases = new Set(entries.map((entry) => entry.releasePaymentId).filter(Boolean));
  const items: Item[] = [
    ...project.payments
      .filter((payment) => !releases.has(payment.id))
      .map((payment) => ({ key: payment.id, date: payment.receivedOn, payment })),
    ...entries
      .filter((entry) => entry.kind === 'refund')
      .map((refund) => ({ key: refund.id, date: refund.date, refund })),
  ].sort(
    // Newest day first; on the same day a refund goes above, as it follows its payment.
    (left, right) =>
      right.date.localeCompare(left.date) || Number('refund' in right) - Number('refund' in left),
  );
  if (items.length === 0) return null;
  const day = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00`), { day: 'numeric', month: 'short' });

  return (
    <div className="flex flex-col gap-2">
      <p className="type-overline text-on-panel-muted uppercase">{t('received')}</p>
      <ul className="flex flex-col divide-y divide-on-panel/12">
        {items.map((item) => {
          const { method, reference, amount } = describe(item);
          return (
            <li key={item.key} className="flex items-center justify-between gap-3 py-2">
              <span className="flex min-w-0 flex-col">
                <span className="type-body-sm text-on-panel">
                  {day(item.date)} ·{' '}
                  {'refund' in item ? t('refundVia', { method: methodT(method) }) : methodT(method)}
                </span>
                {reference && (
                  <span className="truncate font-mono text-[0.6875rem] text-on-panel-muted">
                    {reference}
                  </span>
                )}
              </span>
              <span className="type-body-sm font-medium text-on-panel tabular-nums">
                {amount < 0 ? `−${formatInr(-amount)}` : formatInr(amount)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
