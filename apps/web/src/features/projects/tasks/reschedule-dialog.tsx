'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, Textarea } from '@oneohm/design-system/web';
import { siteVisitKindOf } from '@oneohm/domain';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { useApiForm } from '@/lib/forms/use-api-form';

interface RescheduleMutation {
  readonly mutateAsync: (input: { dueDate: string; reason: string }) => Promise<unknown>;
}

/**
 * A manager moves a task's due date, with the reason kept in the project history. Tasks
 * that wait on it move later when they must; for the site survey the customer is told.
 */
export function RescheduleDialog({
  task,
  open,
  onOpenChange,
  mutation,
}: {
  readonly task: ProjectTask;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly mutation: RescheduleMutation;
}) {
  const t = useTranslations('projects.reschedule');
  const format = useFormatter();
  const formId = useId();
  const form = useApiForm();
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [reason, setReason] = useState('');
  const survey = siteVisitKindOf(task) === 'survey';
  const current = format.dateTime(new Date(task.dueDate), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await form.run(() => mutation.mutateAsync({ dueDate, reason: reason.trim() }));
    if (saved !== undefined) onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(survey ? 'surveyTitle' : 'title')}
      description={task.title}
      footer={
        <>
          <Button type="button" variant="quiet" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" pending={form.pending}>
            {t('submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5 pb-2">
        <Field
          label={t(survey ? 'surveyDate' : 'dueDate')}
          hint={t('current', { date: current })}
          error={form.fieldErrors.dueDate}
          required
        >
          <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </Field>
        <Field label={t('reason')} hint={t('reasonHint')} error={form.fieldErrors.reason} required>
          <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <p className="type-body-sm text-ink-faint">{t(survey ? 'surveyNote' : 'chainNote')}</p>
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
