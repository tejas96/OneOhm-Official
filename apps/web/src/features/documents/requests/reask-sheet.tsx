'use client';

import type { DocumentRequest } from '@oneohm/api-contracts';
import { Button, Field, Sheet, Textarea } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { describeError } from '@/lib/api/api-error';
import { useReaskRequest } from './use-document-requests';

const NOTE_MAX = 300;

/**
 * "Not right, ask again" on a received paper: the paper is taken off, the request opens
 * again and the customer is asked again, with this note shown in their app.
 */
export function ReaskSheet({
  projectId,
  request,
  onClose,
}: {
  readonly projectId: string;
  /** The received request; null closes the sheet. */
  readonly request: DocumentRequest | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('documents.requests.reask');
  return (
    <Sheet
      open={request !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('title')}
      description={t('description')}
    >
      {request && (
        <ReaskForm key={request.id} projectId={projectId} request={request} onClose={onClose} />
      )}
    </Sheet>
  );
}

function ReaskForm({
  projectId,
  request,
  onClose,
}: {
  readonly projectId: string;
  readonly request: DocumentRequest;
  readonly onClose: () => void;
}) {
  const t = useTranslations('documents.requests.reask');
  const reask = useReaskRequest(projectId, onClose);
  const [note, setNote] = useState('');
  const short = note.trim().length < 2;
  return (
    <form
      className="flex flex-col gap-6 px-5 py-6 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!short) reask.mutate({ request, note: note.trim() });
      }}
    >
      <p className="type-body-sm font-medium text-ink">{request.title}</p>
      <Field
        label={t('note')}
        required
        error={reask.isError ? `${t('failed')}: ${describeError(reask.error)}` : null}
      >
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t('notePlaceholder')}
          maxLength={NOTE_MAX}
          rows={3}
          disabled={reask.isPending}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="quiet" disabled={reask.isPending} onClick={onClose}>
          {t('close')}
        </Button>
        <Button type="submit" variant="primary" pending={reask.isPending} disabled={short}>
          {t('send')}
        </Button>
      </div>
    </form>
  );
}
