'use client';

import { Button, Field, Input, Select, Sheet, Textarea } from '@oneohm/design-system/web';
import {
  askKeyOf,
  CUSTOMER_REQUESTABLE_CATEGORIES,
  type CustomerRequestableCategory,
  DOCUMENT_REQUEST_TITLE_MAX,
} from '@oneohm/domain';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { describeError } from '@/lib/api/api-error';
import { useFolderLabel } from '../gallery/use-labels';
import { type ActionScope, useAskCustomer } from './use-document-requests';

/** What to ask for; `requirementKey` is set when it comes from a checklist row. */
export interface AskDraft {
  readonly category: CustomerRequestableCategory;
  readonly title: string;
  readonly requirementKey?: string;
}

interface Row {
  readonly id: number;
  readonly category: CustomerRequestableCategory;
  readonly title: string;
  readonly requirementKey?: string;
}

/**
 * Ask the customer for papers only they hold, one or several at once (for example Aadhaar
 * and PAN). On a project or a lead's site. The customer gets WhatsApp and an app alert,
 * and sends a photo or PDF (PRD 5.4, 6.1).
 */
export function AskCustomerSheet({
  scope,
  draft,
  onClose,
}: {
  readonly scope: ActionScope;
  /** What to ask for first; null closes the sheet. */
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
          scope={scope}
          draft={kept}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function AskForm({
  scope,
  draft,
  onClose,
}: {
  readonly scope: ActionScope;
  readonly draft: AskDraft;
  readonly onClose: () => void;
}) {
  const t = useTranslations('documents.requests.sheet');
  const folderLabel = useFolderLabel();
  const ask = useAskCustomer(scope, onClose);
  const [rows, setRows] = useState<readonly Row[]>([{ id: 0, ...draft }]);
  const [note, setNote] = useState('');
  const change = (id: number, patch: Partial<Row>) =>
    setRows((now) => now.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const ready = rows.every((row) => row.title.trim().length >= 2);
  return (
    <form
      className="flex flex-col gap-6 px-5 py-6 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        // A checklist row brings its key; a free ask is keyed by its kind and words, so
        // Aadhaar and PAN can be asked together but Aadhaar not twice.
        const items = rows.map(({ category, title, requirementKey }) => ({
          category,
          title: title.trim(),
          requirementKey: requirementKey ?? askKeyOf({ category, title }),
        }));
        ask.mutate({ items, note: note.trim() });
      }}
    >
      {rows.map((row, index) => (
        <fieldset key={row.id} className="flex flex-col gap-4">
          <Field label={t('what')} hint={index === 0 ? t('whatHint') : undefined} required>
            <span className="flex items-center gap-2">
              <Input
                value={row.title}
                onChange={(event) => change(row.id, { title: event.target.value })}
                maxLength={DOCUMENT_REQUEST_TITLE_MAX}
                disabled={ask.isPending}
              />
              {rows.length > 1 && (
                <Button
                  type="button"
                  size="sm"
                  variant="quiet"
                  aria-label={t('removeRow')}
                  onClick={() => setRows((now) => now.filter((one) => one.id !== row.id))}
                >
                  <X aria-hidden className="size-4" />
                </Button>
              )}
            </span>
          </Field>
          <Field label={t('category')}>
            <Select
              value={row.category}
              disabled={ask.isPending || Boolean(row.requirementKey)}
              onValueChange={(next) =>
                change(row.id, { category: next as CustomerRequestableCategory })
              }
              options={CUSTOMER_REQUESTABLE_CATEGORIES.map((value) => ({
                value,
                label: folderLabel(value),
              }))}
            />
          </Field>
        </fieldset>
      ))}
      <Button
        type="button"
        size="sm"
        variant="quiet"
        className="self-start"
        leadingIcon={<Plus />}
        disabled={ask.isPending}
        onClick={() =>
          setRows((now) => [
            ...now,
            { id: Math.max(...now.map((row) => row.id)) + 1, category: 'customer_kyc', title: '' },
          ])
        }
      >
        {t('addAnother')}
      </Button>
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
        <Button type="submit" variant="primary" pending={ask.isPending} disabled={!ready}>
          {t('send')}
        </Button>
      </div>
    </form>
  );
}
