'use client';

import type { PurchaseRequest } from '@oneohm/api-contracts';
import { Badge, Sheet } from '@oneohm/design-system/web';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { formatQuantity } from '../../inventory/use-inventory';
import { useRequest } from '../use-purchasing';
import { RequestActions } from './request-actions';
import { RequestStatusPill } from './request-status';

const DAY = { day: 'numeric', month: 'short', year: 'numeric' } as const;
const asDate = (value: string) => new Date(`${value}T12:00:00`);

function Lines({ request }: { readonly request: PurchaseRequest }) {
  const t = useTranslations('purchasing.requests.sheet');
  const format = useFormatter();
  return (
    <section className="flex flex-col gap-3">
      <h3 className="type-overline text-ink-faint uppercase">{t('lines')}</h3>
      <ul className="flex flex-col divide-y divide-hairline border-y border-hairline">
        {request.lines.map((line) => (
          <li key={line.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="type-body text-ink">{line.name}</p>
              <p className="font-mono text-[0.75rem] text-ink-faint">{line.sku}</p>
              <p className="flex flex-wrap items-center gap-2 type-label text-ink-muted">
                {t('free', { quantity: formatQuantity(line.freeInStore), unit: line.unit })}
                {line.freeInStore >= line.quantity && (
                  <Badge variant="soft">{t('coveredByStock')}</Badge>
                )}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              <span className="type-body font-medium text-ink tabular-nums">
                {formatQuantity(line.quantity)} {line.unit}
              </span>
              <span className="type-label text-ink-faint">
                {t('needBy', { date: format.dateTime(asDate(line.neededBy), DAY) })}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Facts({ request }: { readonly request: PurchaseRequest }) {
  const t = useTranslations('purchasing.requests.sheet');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  return (
    <dl className="grid gap-x-8 gap-y-2 type-body-sm text-ink-muted sm:grid-cols-2">
      <dd>
        {request.project ? (
          <Link
            href={`/projects/${request.project.id}?tab=material`}
            className="text-accent hover:underline"
          >
            {t('forProject', { project: `${request.project.code} · ${request.project.name}` })}
          </Link>
        ) : (
          t('forStock')
        )}
      </dd>
      <dd>
        {t('raisedBy', {
          name: request.requestedBy.fullName,
          when: format.relativeTime(new Date(request.requestedAt), now),
        })}
      </dd>
      {request.decidedBy && request.decidedAt && (
        <dd className="sm:col-span-2">
          {t(`decided.${request.status === 'rejected' ? 'rejected' : 'approved'}`, {
            name: request.decidedBy.fullName,
            when: format.relativeTime(new Date(request.decidedAt), now),
          })}
          {request.decisionNote && (
            <span className="mt-1 block rounded-xl bg-sunken px-3 py-2 text-ink">
              {request.decisionNote}
            </span>
          )}
        </dd>
      )}
      {request.purchaseOrder && (
        <dd className="sm:col-span-2">
          <Link
            href={`/inventory?tab=orders&order=${request.purchaseOrder.id}`}
            className="text-accent hover:underline"
          >
            {t('onOrder', { number: request.purchaseOrder.number })}
          </Link>
        </dd>
      )}
    </dl>
  );
}

/** One request: what is asked for, free stock now, the decision and the next step. */
export function RequestSheet({
  requestId,
  onClose,
  onOrder,
}: {
  readonly requestId: string | null;
  readonly onClose: () => void;
  readonly onOrder: (id: string) => void;
}) {
  const t = useTranslations('purchasing.requests.sheet');
  const query = useRequest(requestId);
  const request = query.data;
  return (
    <Sheet
      open={requestId !== null}
      onOpenChange={(next) => !next && onClose()}
      title={request ? <span className="font-mono">{request.number}</span> : t('loading')}
      description={request?.reason}
      header={
        request && (
          <div className="flex">
            <RequestStatusPill status={request.status} />
          </div>
        )
      }
      width="lg"
      footer={request && <RequestActions request={request} onOrder={() => onOrder(request.id)} />}
    >
      <div className="px-5 py-6 sm:px-6">
        {query.isPending && <ListSkeleton label={t('loading')} rows={3} />}
        {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
        {request && (
          <div className="flex flex-col gap-8">
            <Facts request={request} />
            <Lines request={request} />
          </div>
        )}
      </div>
    </Sheet>
  );
}
