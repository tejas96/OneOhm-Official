'use client';

import type { PurchaseOrderDetail } from '@oneohm/api-contracts';
import { formatInr } from '@oneohm/shared';
import { PackageCheck } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { formatQuantity } from '../use-inventory';
import { ReceiptDcr } from './receipt-dcr';
import { useOrderDcr } from './use-order-dcr';

/** Goods receipts on an order, each with its serial numbers and DCR papers. */
export function ReceiptsList({
  orderId,
  receipts,
}: {
  readonly orderId: string;
  readonly receipts: PurchaseOrderDetail['receipts'];
}) {
  const t = useTranslations('inventory.order');
  const tr = useTranslations('purchasing.inspection');
  const format = useFormatter();
  const dcr = useOrderDcr(orderId).data;
  return (
    <section className="flex flex-col gap-3">
      <h3 className="type-overline text-ink-faint uppercase">{t('receipts')}</h3>
      {receipts.length === 0 ? (
        <p className="type-body-sm text-ink-muted">{t('noReceipts')}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {receipts.map((receipt) => (
            <li key={receipt.id} className="flex gap-3 rounded-2xl bg-surface p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-on-track-tint text-on-track">
                <PackageCheck aria-hidden className="size-4" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono type-body-sm font-medium text-ink">
                    {receipt.number}
                  </span>
                  <span className="tabular-nums type-body-sm text-ink">
                    {formatInr(receipt.amountPaise)}
                  </span>
                </p>
                <p className="type-label text-ink-faint">
                  {[
                    format.dateTime(new Date(receipt.receivedOn), {
                      day: 'numeric',
                      month: 'short',
                    }),
                    receipt.locationName,
                    receipt.vendorInvoiceNumber
                      ? t('invoice', { number: receipt.vendorInvoiceNumber })
                      : null,
                    receipt.by,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <ul className="flex flex-col gap-1">
                  {receipt.lines.map((line) => (
                    <li key={line.description} className="type-body-sm text-ink-muted">
                      {t('receiptLine', {
                        quantity: formatQuantity(line.quantity),
                        item: line.description,
                      })}
                      {line.rejectedQuantity > 0 && (
                        <span className="mt-0.5 block text-at-risk">
                          {tr('rejectedLine', {
                            quantity: formatQuantity(line.rejectedQuantity),
                            reason: line.rejectionReason ?? '',
                          })}
                        </span>
                      )}
                      {line.serials.length > 0 && (
                        <span className="mt-1 block font-mono text-[0.75rem] break-words text-ink-faint">
                          {line.serials.join(', ')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <ReceiptDcr
                  orderId={orderId}
                  papers={dcr?.receipts.find((entry) => entry.receiptId === receipt.id)}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
