'use client';

import type { DocumentRecord } from '@oneohm/api-contracts';
import { Button, Field, Select, Sheet } from '@oneohm/design-system/web';
import {
  CUSTOMER_DOCUMENT_CATEGORIES,
  type CustomerDocumentCategory,
  isCustomerDocumentCategory,
  isPersonDocumentCategory,
} from '@oneohm/domain';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { FOLDER_ICONS } from './document-kinds';
import { useMoveDocument } from './use-document-actions';
import { useFolderLabel } from './use-labels';

/** The paper's kind when the customer keeps it; an internal kind starts as Other. */
const kindOfPaper = (document: DocumentRecord): CustomerDocumentCategory =>
  isCustomerDocumentCategory(document.category) ? document.category : 'other';

/** The "no home" choice, open only to an ID or income paper (the person's). */
const NO_HOME = 'none';

/**
 * Move / change kind: file a customer's paper on another of their homes (one choice per
 * project, from the paper's own homes list) or as a kind the customer keeps. The server keeps it on the same
 * customer and asks the customer again for a request the paper no longer answers.
 */
export function MoveSheet({
  document,
  onClose,
  onMoved,
}: {
  /** The paper being moved; null closes the sheet. */
  readonly document: DocumentRecord | null;
  readonly onClose: () => void;
  readonly onMoved: (document: DocumentRecord) => void;
}) {
  const t = useTranslations('documents.gallery.move');
  return (
    <Sheet
      open={document !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('title')}
      description={t('description')}
    >
      {document?.customerId && (
        <MoveForm key={document.id} document={document} onClose={onClose} onMoved={onMoved} />
      )}
    </Sheet>
  );
}

function MoveForm({
  document,
  onClose,
  onMoved,
}: {
  readonly document: DocumentRecord;
  readonly onClose: () => void;
  readonly onMoved: (document: DocumentRecord) => void;
}) {
  const t = useTranslations('documents.gallery.move');
  const folderLabel = useFolderLabel();
  const homesQuery = useQuery({
    queryKey: ['documents', document.id, 'homes'],
    queryFn: () => expectStatus(api.documents.documentHomes({ params: { id: document.id } }), 200),
  });
  const move = useMoveDocument((moved) => {
    onMoved(moved);
    onClose();
  });
  // A home that is only a lead has no project to file on, so it is not offered.
  const homes = (homesQuery.data ?? []).flatMap((one) =>
    one.projectId ? [{ value: one.projectId, label: one.title, description: one.description }] : [],
  );
  const current =
    homesQuery.data?.find((one) => one.propertyId === document.propertyId)?.projectId ?? null;
  const [picked, setHome] = useState<string | null>(null);
  const home = picked ?? (document.propertyId ? (current ?? '') : NO_HOME);
  const [kind, setKind] = useState<CustomerDocumentCategory>(kindOfPaper(document));
  const person = isPersonDocumentCategory(kind);
  const options = person ? [...homes, { value: NO_HOME, label: t('noHome') }] : homes;
  const needsHome = (home === NO_HOME && !person) || home === '';
  const failure = homesQuery.isError
    ? `${t('loadFailed')}: ${describeError(homesQuery.error)}`
    : move.isError
      ? `${t('failed')}: ${describeError(move.error)}`
      : null;
  return (
    <form
      className="flex flex-col gap-6 px-5 py-6 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (needsHome) return;
        const projectId = home === NO_HOME ? null : home;
        move.mutate({ id: document.id, body: { projectId, category: kind } });
      }}
    >
      <Field label={t('kind')}>
        <Select
          value={kind}
          disabled={move.isPending}
          onValueChange={setKind}
          options={CUSTOMER_DOCUMENT_CATEGORIES.map((value) => {
            const Icon = FOLDER_ICONS[value];
            return { value, label: folderLabel(value), icon: <Icon aria-hidden /> };
          })}
        />
      </Field>
      <Field
        label={t('home')}
        error={needsHome && homesQuery.isSuccess ? t('needsHome') : failure}
        required
      >
        <Select
          value={options.some((option) => option.value === home) ? home : undefined}
          placeholder={t('homePlaceholder')}
          disabled={move.isPending || homesQuery.isPending}
          onValueChange={setHome}
          options={options}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="quiet" disabled={move.isPending} onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button type="submit" variant="primary" pending={move.isPending} disabled={needsHome}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
