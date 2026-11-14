'use client';

import { Card, CardHeader, StatusPill } from '@oneohm/design-system/web';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useCan } from '@/providers/current-user';
import { REQUEST_TONE } from './change-requests-list';
import { useChangeRequests } from './use-discom';

/**
 * Every DISCOM change request raised from this project, open, done or cancelled, so a
 * finished one stays findable (the alerts only show requests that still hold work).
 * Requests on the same site but not raised from this project are not listed. Shows
 * nothing until there is one.
 */
export function ProjectChangeRequests({ projectId }: { readonly projectId: string }) {
  const t = useTranslations('discom.projectRequests');
  const statusT = useTranslations('discom.requests.status');
  const format = useFormatter();
  const canView = useCan('discom.manage', 'customers.view', 'projects.view_all');
  const query = useChangeRequests({ projectId });
  if (!canView || !query.data || query.data.length === 0) return null;
  return (
    <Card>
      <CardHeader title={t('title')} description={t('body')} />
      <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
        {query.data.map((request) => (
          <li
            key={request.id}
            className="relative flex flex-col gap-1.5 px-5 py-3.5 transition-colors hover:bg-sunken/50"
          >
            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/discom/change-requests/${request.id}`}
                className="oh-stretched-link type-body font-medium text-ink hover:text-accent"
              >
                {request.title}
              </Link>
              <StatusPill
                tone={REQUEST_TONE[request.status]}
                label={statusT(request.status)}
                size="sm"
              />
            </div>
            <p className="flex flex-wrap gap-x-2 type-body-sm text-ink-faint">
              <span className="font-mono">{request.number}</span>
              <span aria-hidden>·</span>
              <time dateTime={request.createdAt}>
                {format.dateTime(new Date(request.createdAt), {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </time>
            </p>
            {request.status === 'open' && request.currentStep && (
              <p className="type-body-sm text-ink-muted">
                {request.currentStep.title} ·{' '}
                {t('steps', { done: request.stepsDone, total: request.stepsTotal })}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
