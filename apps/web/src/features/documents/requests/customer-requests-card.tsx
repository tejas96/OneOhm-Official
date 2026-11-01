'use client';

import type { DocumentRequest } from '@oneohm/api-contracts';
import { Button, Card, CardHeader, type PillTone, StatusPill } from '@oneohm/design-system/web';
import { ExternalLink, Send } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { documentUrl } from '@/lib/api/upload';
import { useFolderLabel } from '../gallery/use-labels';
import { useCancelRequest, useDocumentRequests } from './use-document-requests';

const TONE: Readonly<Record<DocumentRequest['status'], PillTone>> = {
  open: 'waiting',
  received: 'done',
  cancelled: 'neutral',
};

/** Papers asked from the customer for this project, and whether each has arrived. */
export function CustomerRequestsCard({
  projectId,
  canAsk,
  onAsk,
}: {
  readonly projectId: string;
  readonly canAsk: boolean;
  readonly onAsk: () => void;
}) {
  const t = useTranslations('documents.requests');
  const query = useDocumentRequests(projectId);
  const requests = query.data ?? [];
  if (!canAsk && requests.length === 0) return null;
  return (
    <Card>
      <CardHeader
        title={t('title')}
        description={t('intro')}
        action={
          canAsk && (
            <Button size="sm" variant="secondary" leadingIcon={<Send />} onClick={onAsk}>
              {t('ask')}
            </Button>
          )
        }
      />
      <div className="px-5 pb-4">
        {query.isPending && <ListSkeleton label={t('loading')} rows={2} />}
        {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
        {requests.length > 0 && (
          <ul className="flex flex-col divide-y divide-hairline">
            {requests.map((request) => (
              <RequestRow
                key={request.id}
                projectId={projectId}
                request={request}
                canCancel={canAsk}
              />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function RequestRow({
  projectId,
  request,
  canCancel,
}: {
  readonly projectId: string;
  readonly request: DocumentRequest;
  readonly canCancel: boolean;
}) {
  const t = useTranslations('documents.requests');
  const format = useFormatter();
  const now = useNow();
  const folderLabel = useFolderLabel();
  const cancel = useCancelRequest(projectId);
  const when = (iso: string) => format.relativeTime(new Date(iso), now);
  const asked = request.requestedBy
    ? t('askedBy', { name: request.requestedBy, when: when(request.createdAt) })
    : t('askedWhen', { when: when(request.createdAt) });
  const meta = [
    folderLabel(request.category),
    request.receivedAt ? t('receivedWhen', { when: when(request.receivedAt) }) : asked,
  ];
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="type-body-sm font-medium text-ink">{request.title}</span>
        <span className="type-body-sm text-ink-faint">{meta.join(' · ')}</span>
        {request.note && <span className="type-body-sm text-ink-muted">{request.note}</span>}
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-2">
        <StatusPill size="sm" tone={TONE[request.status]} label={t(`status.${request.status}`)} />
        {request.status === 'received' && request.documentId && (
          <Button asChild size="sm" variant="quiet">
            <a href={documentUrl(request.documentId)} target="_blank" rel="noopener">
              <ExternalLink aria-hidden className="size-4" />
              {t('openFile')}
            </a>
          </Button>
        )}
        {request.status === 'open' && canCancel && (
          <Button
            size="sm"
            variant="quiet"
            pending={cancel.isPending}
            onClick={() => cancel.mutate(request)}
          >
            {t('cancel')}
          </Button>
        )}
      </span>
    </li>
  );
}
