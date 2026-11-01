'use client';

import type { PurchaseOrderDetail } from '@oneohm/api-contracts';
import { Button, Sheet, useToast } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useMutation } from '@tanstack/react-query';
import { Ban, PackageCheck, Send, SquareCheckBig } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { formatQuantity, useOrder, useRefreshInventory } from '../use-inventory';
import { OrderStatusPill } from './order-status';
import { ReceiptsList } from './receipts-list';
import { ReceiveDialog } from './receive-dialog';

type Step = 'send' | 'cancel' | 'close';

/** One purchase order: lines with what has arrived, receipts, and its next steps. */
export function OrderSheet({
  orderId,
  onClose,
}: {
  readonly orderId: string | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('inventory.order');
  const format = useFormatter();
  const order = useOrder(orderId);
  const [receiving, setReceiving] = useState(false);
  const data = order.data;
  const date = (value: string) =>
    format.dateTime(new Date(value), { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Sheet
      open={orderId !== null}
      onOpenChange={(next) => !next && onClose()}
      title={data ? <span className="font-mono">{data.number}</span> : t('lines')}
      description={data?.vendorName}
      header={
        data && (
          <div className="flex">
            <OrderStatusPill status={data.status} />
          </div>
        )
      }
      width="lg"
      footer={data && <OrderActions order={data} onReceive={() => setReceiving(true)} />}
    >
      <div className="px-5 py-6 sm:px-6">
        {order.isPending && <ListSkeleton label={t('lines')} rows={4} />}
        {order.isError && <LoadError error={order.error} onRetry={() => order.refetch()} />}
        {data && (
          <div className="flex flex-col gap-8">
            <dl className="grid gap-x-8 gap-y-2 type-body-sm text-ink-muted sm:grid-cols-2">
              <dd>{t('ordered', { date: date(data.orderDate) })}</dd>
              {data.expectedOn && <dd>{t('expected', { date: date(data.expectedOn) })}</dd>}
              <dd>
                {data.projectId ? (
                  <Link
                    href={`/projects/${data.projectId}`}
                    className="text-accent hover:underline"
                  >
                    {t('forProject', { project: `${data.projectCode} · ${data.projectName}` })}
                  </Link>
                ) : (
                  t('forStock')
                )}
              </dd>
              {data.createdBy && <dd>{t('by', { name: data.createdBy })}</dd>}
            </dl>
            <section className="flex flex-col gap-3">
              <h3 className="type-overline text-ink-faint uppercase">{t('lines')}</h3>
              <ul className="flex flex-col divide-y divide-hairline border-y border-hairline">
                {data.lines.map((line) => (
                  <li key={line.id} className="flex items-center gap-4 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="truncate type-body text-ink">{line.description}</p>
                      <p className="type-label text-ink-faint">
                        {t('receivedOf', {
                          received: formatQuantity(line.receivedQuantity),
                          ordered: formatQuantity(line.quantity),
                          unit: line.unit,
                        })}{' '}
                        · {formatInr(line.ratePaise)} + {line.taxRateBp / 100}%
                      </p>
                      <span className="h-1 w-full max-w-48 overflow-hidden rounded-full bg-sunken">
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{
                            width: `${Math.min(100, (line.receivedQuantity / line.quantity) * 100)}%`,
                          }}
                        />
                      </span>
                    </div>
                    <span className="shrink-0 tabular-nums text-ink">
                      {formatInr(line.totalPaise)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="flex items-baseline justify-between type-body-sm text-ink-muted">
                {t('totals', {
                  subtotal: formatInr(data.subtotalPaise),
                  tax: formatInr(data.taxPaise),
                })}
                <span className="type-display-md text-ink tabular-nums">
                  {formatInr(data.totalPaise)}
                </span>
              </p>
            </section>
            {data.notes && <p className="type-body-sm text-ink-muted">{data.notes}</p>}
            <ReceiptsList receipts={data.receipts} />
            <ReceiveDialog order={receiving ? data : null} onClose={() => setReceiving(false)} />
          </div>
        )}
      </div>
    </Sheet>
  );
}

function OrderActions({
  order,
  onReceive,
}: {
  readonly order: PurchaseOrderDetail;
  readonly onReceive: () => void;
}) {
  const t = useTranslations('inventory.order');
  const toast = useToast();
  const refresh = useRefreshInventory();
  const canBuy = useCan('procurement.manage');
  const canReceive = useCan('inventory.manage') || canBuy;
  const step = useMutation({
    mutationFn: (which: Step) => {
      const params = { params: { id: order.id } };
      if (which === 'send') return expectStatus(api.inventory.purchaseOrders.send(params), 200);
      if (which === 'cancel') return expectStatus(api.inventory.purchaseOrders.cancel(params), 200);
      return expectStatus(api.inventory.purchaseOrders.close(params), 200);
    },
    onSuccess: async (updated, which) => {
      await refresh(updated.projectId);
      toast({ tone: 'success', title: t(`done.${which}`, { number: updated.number }) });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
  const busy = (which: Step) => step.isPending && step.variables === which;
  const receivable = order.status === 'sent' || order.status === 'partly_received';

  return (
    <div className="flex w-full flex-wrap justify-end gap-2">
      {canBuy && (order.status === 'draft' || order.status === 'sent') && (
        <Button
          variant="quiet"
          leadingIcon={<Ban />}
          pending={busy('cancel')}
          disabled={step.isPending}
          onClick={() => step.mutate('cancel')}
        >
          {t('cancel')}
        </Button>
      )}
      {canBuy && order.status === 'partly_received' && (
        <Button
          variant="secondary"
          leadingIcon={<SquareCheckBig />}
          pending={busy('close')}
          disabled={step.isPending}
          onClick={() => step.mutate('close')}
          title={t('closeHint')}
        >
          {t('close')}
        </Button>
      )}
      {canBuy && order.status === 'draft' && (
        <Button
          variant="primary"
          leadingIcon={<Send />}
          pending={busy('send')}
          disabled={step.isPending}
          onClick={() => step.mutate('send')}
        >
          {t('send')}
        </Button>
      )}
      {canReceive && receivable && (
        <Button variant="primary" leadingIcon={<PackageCheck />} onClick={onReceive}>
          {t('receive')}
        </Button>
      )}
    </div>
  );
}
