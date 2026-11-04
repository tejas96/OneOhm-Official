'use client';

import type { DocumentRequest } from '@oneohm/api-contracts';
import { Button, type PillTone, StatusPill } from '@oneohm/design-system/web';
import { Check, ExternalLink, FileText } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { documentUrl } from '@/lib/api/upload';
import { useCan } from '@/providers/current-user';
import { useFolderLabel } from '../gallery/use-labels';
import { useCancelRequest, useCheckPapers } from './use-document-requests';

const TONE: Readonly<Record<DocumentRequest['status'], PillTone>> = {
  open: 'waiting',
  received: 'review',
  closed: 'done',
  cancelled: 'neutral',
};

/** What a row says of its status: waiting on the customer, to check, done, cancelled. */
const STATUS_KEY: Readonly<Record<DocumentRequest['status'], string>> = {
  open: 'waiting',
  received: 'toCheck',
  closed: 'done',
  cancelled: 'cancelled',
};

/** One ask: its type icon, title, home, status, who sent it and when, and what the team can do. */
export function ActionRow({
  request,
  onReask,
}: {
  readonly request: DocumentRequest;
  readonly onReask: () => void;
}) {
  const t = useTranslations('documents.requests');
  const format = useFormatter();
  const now = useNow();
  const folderLabel = useFolderLabel();
  const canAct = useCan('documents.upload', 'documents.manage');
  const cancel = useCancelRequest();
  const check = useCheckPapers();
  const when = (iso: string) => format.relativeTime(new Date(iso), now);
  const asked = request.requestedBy
    ? t('askedBy', { name: request.requestedBy, when: when(request.createdAt) })
    : t('askedWhen', { when: when(request.createdAt) });
  const meta = [
    request.homeName,
    folderLabel(request.category),
    asked,
    request.receivedAt ? t('receivedWhen', { when: when(request.receivedAt) }) : null,
    request.remindersSent > 0 ? t('reminders', { count: request.remindersSent }) : null,
  ].filter((part) => part !== null);
  const note = request.reason || request.note;
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex min-w-0 items-start gap-3">
        <FileText aria-label={t('type.paper')} className="mt-0.5 size-4 shrink-0 text-ink-faint" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="type-body-sm font-medium text-ink">{request.title}</span>
          <span className="type-body-sm text-ink-faint">{meta.join(' · ')}</span>
          {note && <span className="type-body-sm text-ink-muted">{note}</span>}
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-2">
        <StatusPill
          size="sm"
          tone={TONE[request.status]}
          label={t(`status.${STATUS_KEY[request.status]}`)}
        />
        {request.documentId && request.status !== 'cancelled' && request.status !== 'open' && (
          <Button asChild size="sm" variant="quiet">
            <a href={documentUrl(request.documentId)} target="_blank" rel="noopener">
              <ExternalLink aria-hidden className="size-4" />
              {t('openFile')}
            </a>
          </Button>
        )}
        {canAct && request.status === 'received' && request.documentId && (
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={<Check />}
            pending={check.isPending}
            onClick={() => request.documentId && check.mutate([request.documentId])}
          >
            {t('looksGood')}
          </Button>
        )}
        {canAct && (request.status === 'received' || request.status === 'closed') && (
          <Button size="sm" variant="quiet" onClick={onReask}>
            {t('reask.action')}
          </Button>
        )}
        {canAct && request.status === 'open' && (
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
