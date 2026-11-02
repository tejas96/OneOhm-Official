'use client';

import { Button, Dialog, Field, SegmentedControl, Textarea } from '@oneohm/design-system/web';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { useApiForm } from '@/lib/forms/use-api-form';

export interface DecisionTarget {
  readonly title: string;
  readonly summary?: ReactNode;
  /** Which way the approver leaned when they opened it. */
  readonly approve: boolean;
}

type Choice = 'approve' | 'decline';

/** Approve or decline with an optional note the person sees; the server's refusal shows here. */
export function DecideDialog({
  target,
  onClose,
  onDecide,
}: {
  readonly target: DecisionTarget | null;
  readonly onClose: () => void;
  /** Saves the decision; resolves when done, throws the API's error otherwise. */
  readonly onDecide: (approve: boolean, note: string | null) => Promise<unknown>;
}) {
  const t = useTranslations('team.decide');
  const form = useApiForm();
  const [choice, setChoice] = useState<Choice>('approve');
  const [note, setNote] = useState('');
  const { reset } = form;

  useEffect(() => {
    if (!target) return;
    setChoice(target.approve ? 'approve' : 'decline');
    setNote('');
    reset();
  }, [target, reset]);

  const submit = async () => {
    const approve = choice === 'approve';
    await form.run(() => onDecide(approve, note.trim() || null), onClose);
  };

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
      title={target?.title ?? ''}
      size="md"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant={choice === 'approve' ? 'primary' : 'danger'}
            pending={form.pending}
            onClick={submit}
          >
            {choice === 'approve' ? t('confirmApprove') : t('confirmDecline')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        {target?.summary}
        <SegmentedControl
          value={choice}
          onValueChange={setChoice}
          label={t('choice')}
          options={[
            { value: 'approve', label: t('approve'), icon: <Check /> },
            { value: 'decline', label: t('decline'), icon: <X /> },
          ]}
          className="self-start"
        />
        <Field label={t('note')} hint={t('noteHint')} error={form.fieldErrors.note}>
          <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <FormError message={form.error} />
      </div>
    </Dialog>
  );
}
