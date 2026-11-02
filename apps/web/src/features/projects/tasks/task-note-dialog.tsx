'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Textarea } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { useApiForm } from '@/lib/forms/use-api-form';

interface NoteMutation {
  readonly mutateAsync: (text: string) => Promise<unknown>;
}

/**
 * One short text for a task: a progress update for the project history, or what to
 * correct when the reviewer sends the work back. `kind` picks the words.
 */
export function TaskNoteDialog({
  kind,
  task,
  open,
  onOpenChange,
  mutation,
}: {
  readonly kind: 'update' | 'sendBack';
  readonly task: ProjectTask;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly mutation: NoteMutation;
}) {
  const t = useTranslations(`projects.${kind}`);
  const formId = useId();
  const form = useApiForm();
  const [text, setText] = useState('');
  const field = kind === 'update' ? 'note' : 'reason';

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await form.run(
      () => mutation.mutateAsync(text.trim()),
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={task.title}
      footer={
        <>
          <Button type="button" variant="quiet" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant={kind === 'sendBack' ? 'secondary' : 'primary'}
            pending={form.pending}
          >
            {t('submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4 pb-2">
        <p className="type-body-sm text-ink-muted">{t('body')}</p>
        <Field label={t('label')} hint={t('hint')} error={form.fieldErrors[field]} required>
          <Textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} />
        </Field>
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
