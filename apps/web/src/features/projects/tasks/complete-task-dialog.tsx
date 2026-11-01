'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { Badge, Button, Dialog, Field, Textarea } from '@oneohm/design-system/web';
import { CircleAlert, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { EvidenceUploader } from '@/features/documents/evidence-uploader';
import { ApiError, describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { ChecklistFields } from './checklist-fields';
import { FactFields } from './fact-fields';
import { SignaturePad } from './signature-pad';
import type { CompleteInput } from './use-task-actions';

interface CompleteMutation {
  readonly isPending: boolean;
  readonly mutateAsync: (input: CompleteInput) => Promise<unknown>;
}

/**
 * Completing a task records the facts it captures (they feed the statutory reports),
 * pre-filled with what the project already knows, and a note about the evidence.
 * Approval tasks go to a manager first.
 */
export function CompleteTaskDialog({
  task,
  open,
  onOpenChange,
  mutation,
}: {
  readonly task: ProjectTask;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly mutation: CompleteMutation;
}) {
  const t = useTranslations('projects.complete');
  const evidenceT = useTranslations('projects.evidence');
  const canApprove = useCan('tasks.approve');
  const formId = useId();
  const [facts, setFacts] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(
      task.captureFields.map((field) => [field.key, task.knownFacts[field.key] ?? '']),
    ),
    ...Object.fromEntries(task.checklist.map((item) => [item.key, item.done ? 'yes' : ''])),
  }));
  const setFact = (key: string, value: string) =>
    setFacts((current) => ({ ...current, [key]: value }));
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    try {
      await mutation.mutateAsync({ facts, note: note.trim() || null });
      onOpenChange(false);
    } catch (caught) {
      setError(describeError(caught));
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={task.title}
      size="lg"
      autoFocusField
      footer={
        <>
          <Button type="button" variant="quiet" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            pending={mutation.isPending}
            disabled={uploading}
          >
            {task.approval && !canApprove ? t('submitReview') : t('submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5 pb-2">
        {task.captureFields.length > 0 && (
          <section className="flex flex-col gap-3">
            <p className="type-overline text-ink-faint uppercase">{t('records')}</p>
            <FactFields
              fields={task.captureFields}
              values={facts}
              errors={fieldErrors}
              onChange={setFact}
            />
          </section>
        )}
        {task.checklist.length > 0 && (
          <section className="flex flex-col gap-3">
            <p className="type-overline text-ink-faint uppercase">{t('checklist')}</p>
            <ChecklistFields items={task.checklist} values={facts} onChange={setFact} />
          </section>
        )}
        {task.evidence.length > 0 && (
          <section className="flex flex-col gap-2">
            <p className="type-overline text-ink-faint uppercase">{t('evidence')}</p>
            <ul className="flex flex-wrap gap-2">
              {task.evidence.map((kind) => (
                <li key={kind}>
                  <Badge variant="soft">{evidenceT(kind)}</Badge>
                </li>
              ))}
            </ul>
          </section>
        )}
        <EvidenceUploader task={task} onBusyChange={setUploading} />
        {task.evidence.includes('signature') && <SignaturePad task={task} />}
        <Field label={t('note')} hint={t('noteHint')}>
          <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        {task.approval && !canApprove && (
          <p className="flex items-start gap-2 rounded-md bg-review-tint px-3 py-2.5 type-body-sm text-review">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t('approvalNotice')}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md bg-overdue-tint px-3 py-2.5 type-body-sm text-overdue"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
