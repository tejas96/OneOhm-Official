'use client';

import type { DiscomDeskItem } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, Textarea, useToast } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useRefreshDiscom } from './use-discom';

/** The DISCOM's reference number, which office has it, and when to chase next. */
export function FollowUpDialog({
  item,
  onClose,
}: {
  readonly item: DiscomDeskItem;
  readonly onClose: () => void;
}) {
  const t = useTranslations('discom.followUp');
  const formId = useId();
  const toast = useToast();
  const refresh = useRefreshDiscom();
  const form = useApiForm();
  const [referenceNumber, setReference] = useState(item.referenceNumber ?? '');
  const [office, setOffice] = useState(item.office ?? '');
  const [nextFollowUpOn, setNext] = useState(item.nextFollowUpOn ?? '');
  const [note, setNote] = useState(item.note ?? '');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await form.run(
      () =>
        expectStatus(
          api.discom.updateFollowUp({
            params: { taskId: item.id },
            body: {
              referenceNumber: referenceNumber.trim() || null,
              office: office.trim() || null,
              nextFollowUpOn: nextFollowUpOn || null,
              note: note.trim() || null,
            },
          }),
          200,
        ),
      async () => {
        await refresh();
        toast({ tone: 'success', title: t('saved') });
        onClose();
      },
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('title')}
      description={`${item.subject} · ${item.title}`}
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {t('save')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('reference')} error={form.fieldErrors.referenceNumber}>
            <Input
              value={referenceNumber}
              onChange={(event) => setReference(event.target.value)}
              className="font-mono"
            />
          </Field>
          <Field label={t('office')} error={form.fieldErrors.office}>
            <Input value={office} onChange={(event) => setOffice(event.target.value)} />
          </Field>
        </div>
        <Field label={t('next')} error={form.fieldErrors.nextFollowUpOn}>
          <Input
            type="date"
            value={nextFollowUpOn}
            onChange={(event) => setNext(event.target.value)}
          />
        </Field>
        <Field label={t('note')} error={form.fieldErrors.note}>
          <Textarea value={note} rows={3} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
