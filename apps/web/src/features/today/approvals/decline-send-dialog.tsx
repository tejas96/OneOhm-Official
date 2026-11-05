'use client';

import type { ApprovalItem } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Textarea, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { checkText } from '../../finance/payables/text-check';

const NOTE_MIN = 2;
const NOTE_MAX = 500;

/** Says no to an "ask to send", with a note the asker is told. The note may be left empty. */
export function DeclineSendDialog({
  item,
  onClose,
}: {
  readonly item: ApprovalItem | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('today.approvals.decline');
  const formId = useId();
  const toast = useToast();
  const client = useQueryClient();
  const form = useApiForm();
  const [note, setNote] = useState('');

  // Empty is fine (a default note is sent); once typed it needs 2 to 500 characters.
  const check = checkText(note, NOTE_MIN, NOTE_MAX);
  const problem =
    check.problem === 'short'
      ? t('noteShort', { min: NOTE_MIN })
      : check.problem === 'long'
        ? t('noteLong', { max: NOTE_MAX })
        : null;

  const close = () => {
    setNote('');
    form.reset();
    onClose();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!item || problem !== null) return;
    await form.run(
      () =>
        expectStatus(
          api.bankPayouts.declinePayoutRequest({
            params: { id: item.id },
            body: { note: note.trim() || t('defaultNote') },
          }),
          204,
        ),
      async () => {
        await client.invalidateQueries();
        toast({ title: t('done'), reference: item.subject, tone: 'success' });
        close();
      },
    );
  };

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => !open && close()}
      title={t('title')}
      description={item ? t('description', { subject: item.subject }) : undefined}
      autoFocusField
      footer={
        <Button
          type="submit"
          form={formId}
          variant="danger"
          pending={form.pending}
          disabled={problem !== null}
        >
          {t('submit')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field
          label={t('note')}
          hint={
            check.showCounter
              ? t('noteCount', { used: check.length, max: NOTE_MAX })
              : t('noteHint')
          }
          error={problem ?? form.fieldErrors.note}
        >
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              form.reset();
            }}
          />
        </Field>
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
