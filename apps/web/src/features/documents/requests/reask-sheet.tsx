'use client';

import { Button, Field, Sheet, Textarea } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { describeError } from '@/lib/api/api-error';
import { useReaskRequest } from './use-document-requests';

const NOTE_MAX = 300;

/** The request to ask again about: its id and the paper's name. */
export interface ReaskTarget {
  readonly id: string;
  readonly title: string;
}

/**
 * "Not right, ask again" on a received paper: the paper is taken off, the request opens
 * again and the customer is asked again, with this reason shown in their app and on WhatsApp.
 */
export function ReaskSheet({
  target,
  onClose,
}: {
  /** The received request; null closes the sheet. */
  readonly target: ReaskTarget | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('documents.requests.reask');
  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('title')}
      description={t('description')}
    >
      {target && <ReaskForm key={target.id} target={target} onClose={onClose} />}
    </Sheet>
  );
}

function ReaskForm({
  target,
  onClose,
}: {
  readonly target: ReaskTarget;
  readonly onClose: () => void;
}) {
  const t = useTranslations('documents.requests.reask');
  const reask = useReaskRequest(onClose);
  const [note, setNote] = useState('');
  const short = note.trim().length < 2;
  return (
    <form
      className="flex flex-col gap-6 px-5 py-6 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!short) reask.mutate({ id: target.id, note: note.trim() });
      }}
    >
      <p className="type-body-sm font-medium text-ink">{target.title}</p>
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
