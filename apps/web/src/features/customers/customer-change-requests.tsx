'use client';

import type { ChangeRequestSummary } from '@oneohm/api-contracts';
import { Card, CardHeader, type PillTone, StatusPill } from '@oneohm/design-system/web';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

const TONE: Readonly<Record<ChangeRequestSummary['status'], PillTone>> = {
  open: 'waiting',
  completed: 'done',
  cancelled: 'neutral',
};

/** DISCOM change requests for the customer's sites, newest first. */
export function CustomerChangeRequests({
  requests,
}: {
  readonly requests: readonly ChangeRequestSummary[];
}) {
  const t = useTranslations('customers.changeRequests');
  const format = useFormatter();
  return (
    <Card>
      <CardHeader title={t('title')} description={t('body')} />
      {requests.length === 0 ? (
        <p className="border-t border-hairline px-5 py-4 type-body-sm text-ink-faint">
          {t('none')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
          {requests.map((request) => (
            <li
              key={request.id}
              className="relative flex flex-col gap-1.5 px-5 py-3.5 transition-colors hover:bg-sunken/50"
            >
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/discom/change-requests/${request.id}`}
                  className="oh-stretched-link type-body font-medium text-ink hover:text-accent"
                >
                  {t(`types.${request.type}`)}
                </Link>
                <StatusPill
                  tone={TONE[request.status]}
                  label={t(`status.${request.status}`)}
                  size="sm"
                />
              </div>
              <p className="flex flex-wrap gap-x-2 type-body-sm text-ink-faint">
                <span className="font-mono">{request.number}</span>
                <span aria-hidden>·</span>
                <span>{request.project?.code ?? request.property.label}</span>
                <span aria-hidden>·</span>
                <span>
                  {format.dateTime(new Date(request.createdAt), { day: 'numeric', month: 'short' })}
                </span>
              </p>
              {request.status === 'open' && (
                <p className="type-body-sm text-ink-muted">
                  {request.currentStep ? `${request.currentStep.title} · ` : ''}
                  {t('steps', { done: request.stepsDone, total: request.stepsTotal })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
