'use client';

import type { DocumentRecord } from '@oneohm/api-contracts';
import { Button, Field, Select, Sheet } from '@oneohm/design-system/web';
import { DOCUMENT_CATEGORIES, isPersonDocumentCategory } from '@oneohm/domain';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { FOLDER_ICONS, folderOf } from './document-kinds';
import { useMoveDocument } from './use-document-actions';
import { useFolderLabel } from './use-labels';

/** The "no home" choice, open only to an ID or income paper (the person's). */
const NO_HOME = 'none';

/**
 * Move / change kind: file a customer's paper on another of their homes (one choice per
 * project that is not cancelled) or as another kind. The server keeps it on the same
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
        <MoveForm
          key={document.id}
          document={document}
          customerId={document.customerId}
          onClose={onClose}
          onMoved={onMoved}
        />
      )}
    </Sheet>
  );
}

function MoveForm({
  document,
  customerId,
  onClose,
  onMoved,
}: {
  readonly document: DocumentRecord;
  readonly customerId: string;
  readonly onClose: () => void;
  readonly onMoved: (document: DocumentRecord) => void;
}) {
  const t = useTranslations('documents.gallery.move');
  const folderLabel = useFolderLabel();
  const customer = useQuery({
    queryKey: ['customers', 'detail', customerId],
    queryFn: () => expectStatus(api.crm.getCustomer({ params: { id: customerId } }), 200),
  });
  const move = useMoveDocument((moved) => {
    onMoved(moved);
    onClose();
  });
  const [home, setHome] = useState(document.projectId ?? NO_HOME);
  const [kind, setKind] = useState(folderOf(document));
  const person = isPersonDocumentCategory(kind);
  const homes = (customer.data?.projects ?? [])
    .filter((project) => project.status !== 'cancelled')
    .map((project) => ({ value: project.id, label: `${project.place} · ${project.code}` }));
  const options = person ? [...homes, { value: NO_HOME, label: t('noHome') }] : homes;
  const needsHome = home === NO_HOME && !person;
  const failure = customer.isError
    ? `${t('loadFailed')}: ${describeError(customer.error)}`
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
          options={DOCUMENT_CATEGORIES.map((value) => {
            const Icon = FOLDER_ICONS[value];
            return { value, label: folderLabel(value), icon: <Icon aria-hidden /> };
          })}
        />
      </Field>
      <Field label={t('home')} error={needsHome ? t('needsHome') : failure} required>
        <Select
          value={options.some((option) => option.value === home) ? home : undefined}
          placeholder={t('homePlaceholder')}
          disabled={move.isPending || customer.isPending}
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
