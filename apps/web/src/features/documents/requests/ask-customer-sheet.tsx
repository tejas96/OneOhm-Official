'use client';

import { Button, Field, Input, Select, Sheet, Textarea } from '@oneohm/design-system/web';
import {
  CUSTOMER_REQUESTABLE_CATEGORIES,
  type CustomerRequestableCategory,
  DOCUMENT_REQUEST_TITLE_MAX,
} from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { describeError } from '@/lib/api/api-error';
import { useFolderLabel } from '../gallery/use-labels';
import { useAskCustomer } from './use-document-requests';

export interface AskDraft {
  readonly category: CustomerRequestableCategory;
  readonly title: string;
}

/**
 * Ask the project's customer for one paper only they hold. The customer gets WhatsApp
 * and an app alert, and sends a photo or PDF from the app (PRD 5.4, 6.1).
 */
export function AskCustomerSheet({
  projectId,
  draft,
  onClose,
}: {
  readonly projectId: string;
  /** What to ask for; null closes the sheet. */
  readonly draft: AskDraft | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('documents.requests.sheet');
  const [kept, setKept] = useState<AskDraft | null>(draft);
  if (draft && draft !== kept) setKept(draft);
  return (
    <Sheet
      open={draft !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('title')}
      description={t('description')}
    >
      {kept && (
        <AskForm
          key={`${kept.category}-${kept.title}`}
          projectId={projectId}
          draft={kept}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function AskForm({
  projectId,
  draft,
  onClose,
}: {
  readonly projectId: string;
  readonly draft: AskDraft;
  readonly onClose: () => void;
}) {
  const t = useTranslations('documents.requests.sheet');
  const folderLabel = useFolderLabel();
  const ask = useAskCustomer(projectId, onClose);
  const [title, setTitle] = useState(draft.title);
  const [category, setCategory] = useState<CustomerRequestableCategory>(draft.category);
  const [note, setNote] = useState('');
  const short = title.trim().length < 2;
  return (
    <form
      className="flex flex-col gap-6 px-5 py-6 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!short) ask.mutate({ title: title.trim(), category, note: note.trim() });
      }}
    >
      <Field label={t('what')} hint={t('whatHint')} required>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={DOCUMENT_REQUEST_TITLE_MAX}
          disabled={ask.isPending}
        />
      </Field>
      <Field label={t('category')}>
        <Select
          value={category}
          disabled={ask.isPending}
          onValueChange={(next) => setCategory(next as CustomerRequestableCategory)}
          options={CUSTOMER_REQUESTABLE_CATEGORIES.map((value) => ({
            value,
            label: folderLabel(value),
          }))}
        />
      </Field>
      <Field
        label={t('note')}
        error={ask.isError ? `${t('failed')}: ${describeError(ask.error)}` : null}
      >
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t('notePlaceholder')}
          maxLength={300}
          rows={3}
          disabled={ask.isPending}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="quiet" disabled={ask.isPending} onClick={onClose}>
          {t('close')}
        </Button>
        <Button type="submit" variant="primary" pending={ask.isPending} disabled={short}>
          {t('send')}
        </Button>
      </div>
    </form>
  );
}
