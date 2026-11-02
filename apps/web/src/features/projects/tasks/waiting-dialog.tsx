'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { Button, Dialog, Field, SegmentedControl, Textarea } from '@oneohm/design-system/web';
import { WAITING_PARTIES, type WaitingParty } from '@oneohm/domain';
import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { ApiError, describeError } from '@/lib/api/api-error';

interface WaitingMutation {
  readonly isPending: boolean;
  readonly mutateAsync: (input: { party: WaitingParty; note: string | null }) => Promise<unknown>;
}

/** Puts a task on hold with who it is waiting on; DISCOM and bank time is reported apart. */
export function WaitingDialog({
  task,
  open,
  onOpenChange,
  mutation,
}: {
  readonly task: ProjectTask;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly mutation: WaitingMutation;
}) {
  const t = useTranslations('projects.waiting');
  const partyT = useTranslations('commandCenter.party');
  const formId = useId();
  const [party, setParty] = useState<WaitingParty>(task.waitingParty);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending) return;
    setError(null);
    setFieldErrors({});
    try {
      await mutation.mutateAsync({ party, note: note.trim() || null });
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
      footer={
        <>
          <Button type="button" variant="quiet" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" pending={mutation.isPending}>
            {t('submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5 pb-2">
        <div className="flex flex-col gap-2">
          <p className="type-label text-ink-muted">{t('party')}</p>
          <SegmentedControl
            label={t('party')}
            value={party}
            onValueChange={setParty}
            options={WAITING_PARTIES.map((value) => ({ value, label: partyT(value) }))}
            className="self-start"
          />
          <p className="type-body-sm text-ink-faint">{t('partyHint')}</p>
          {fieldErrors.party && <p className="type-body-sm text-overdue">{fieldErrors.party}</p>}
        </div>
        <Field label={t('note')} hint={t('noteHint')} error={fieldErrors.note}>
          <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
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
