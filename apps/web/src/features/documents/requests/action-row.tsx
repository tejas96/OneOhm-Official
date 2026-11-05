'use client';

import type { DocumentRequest } from '@oneohm/api-contracts';
import { Button, type PillTone, StatusPill } from '@oneohm/design-system/web';
import type { Capability } from '@oneohm/domain';
import { rightsForAsk } from '@oneohm/domain';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarCheck,
  CalendarClock,
  Check,
  CircleHelp,
  ClipboardCheck,
  ExternalLink,
  FileText,
  IndianRupee,
  MapPin,
  PenLine,
  PhoneCall,
  Star,
  Wallet,
} from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { documentUrl } from '@/lib/api/upload';
import { useCan } from '@/providers/current-user';
import { useFolderLabel } from '../gallery/use-labels';
import { InPersonDone } from './in-person-done';
import { useCancelRequest, useCheckPapers } from './use-document-requests';
import { useLocationReview } from './use-location-review';

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

/** The icon of each kind of ask. */
const ICON: Readonly<Record<string, LucideIcon>> = {
  paper: FileText,
  location: MapPin,
  pay: IndianRupee,
  callback: PhoneCall,
  visit_pick: CalendarClock,
  presence: CalendarCheck,
  signature: PenLine,
  confirm: CircleHelp,
  self_survey: ClipboardCheck,
  rating: Star,
  payout: Wallet,
};

/** A call-back that waits is "To call", a picked visit day "To confirm"; the rest by status. */
function statusKey(request: DocumentRequest): string {
  if (request.status === 'received' && request.type === 'callback') return 'toCall';
  if (request.status === 'received' && request.type === 'visit_pick') return 'toConfirm';
  return STATUS_KEY[request.status];
}

/** "1.2 km" or "340 m": how far a customer's pin is from the saved point. */
const distance = (metres: number) =>
  metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;

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
  // Papers follow the documents rights; the other asks the rights of sending them (redesign §18).
  const canAct = useCan(...(rightsForAsk(request.type) as Capability[]));
  const cancel = useCancelRequest();
  const check = useCheckPapers();
  const review = useLocationReview();
  const isPaper = request.type === 'paper';
  const Icon = ICON[request.type] ?? FileText;
  const suggestion = request.suggestion;
  const when = (iso: string) => format.relativeTime(new Date(iso), now);
  const asked = request.requestedBy
    ? t('askedBy', { name: request.requestedBy, when: when(request.createdAt) })
    : t('askedWhen', { when: when(request.createdAt) });
  const meta = [
    request.homeName,
    isPaper ? folderLabel(request.category) : null,
    asked,
    request.receivedAt ? t('receivedWhen', { when: when(request.receivedAt) }) : null,
    request.remindersSent > 0 ? t('reminders', { count: request.remindersSent }) : null,
  ].filter((part) => part !== null);
  const note = request.reason || request.note;
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex min-w-0 items-start gap-3">
        <Icon
          aria-label={t(`type.${request.type}` as 'type.paper')}
          className="mt-0.5 size-4 shrink-0 text-ink-faint"
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="type-body-sm font-medium text-ink">{request.title}</span>
          <span className="type-body-sm text-ink-faint">{meta.join(' · ')}</span>
          {note && <span className="type-body-sm text-ink-muted">{note}</span>}
          {suggestion && (
            <span className="type-body-sm text-ink-muted">
              {suggestion.distanceM === null
                ? t('location.suggestionNew')
                : t('location.suggestion', { distance: distance(suggestion.distanceM) })}{' '}
              <a
                className="text-accent hover:underline"
                href={`https://maps.google.com/?q=${suggestion.latitude},${suggestion.longitude}`}
                target="_blank"
                rel="noopener"
              >
                {t('location.open')}
              </a>
            </span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-2">
        <StatusPill
          size="sm"
          tone={TONE[request.status]}
          label={t(`status.${statusKey(request)}`)}
        />
        {request.documentId && request.status !== 'cancelled' && request.status !== 'open' && (
          <Button asChild size="sm" variant="quiet">
            <a href={documentUrl(request.documentId)} target="_blank" rel="noopener">
              <ExternalLink aria-hidden className="size-4" />
              {t('openFile')}
            </a>
          </Button>
        )}
        {canAct && request.type === 'callback' && request.status === 'received' && (
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={<PhoneCall />}
            pending={review.called.isPending}
            onClick={() => review.called.mutate(request.id)}
          >
            {t('callback.called')}
          </Button>
        )}
        {canAct && suggestion && (
          <>
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<Check />}
              pending={review.accept.isPending}
              onClick={() => review.accept.mutate(request.id)}
            >
              {t('location.accept')}
            </Button>
            <Button
              size="sm"
              variant="quiet"
              pending={review.ignore.isPending}
              onClick={() => review.ignore.mutate(request.id)}
            >
              {t('location.ignore')}
            </Button>
          </>
        )}
        {canAct && isPaper && request.status === 'received' && request.documentId && (
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
        {canAct && isPaper && (request.status === 'received' || request.status === 'closed') && (
          <Button size="sm" variant="quiet" onClick={onReask}>
            {t('reask.action')}
          </Button>
        )}
        {canAct && request.status === 'open' && request.channel === 'in_person' && (
          <InPersonDone request={request} />
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
