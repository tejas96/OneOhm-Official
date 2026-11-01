'use client';

import type { LeadStepRecord } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { useChangeLeadSteps } from './use-lead-steps';

export interface StepDraft {
  readonly stage: LeadStepRecord['stage'];
  /** null adds a new step to the stage. */
  readonly step: LeadStepRecord | null;
}

/** Name a new step, or rename one; leads on it keep their place. */
export function StepDialog({
  draft,
  onClose,
}: {
  readonly draft: StepDraft | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('settings.leadSteps.dialog');
  const stageT = useTranslations('settings.leadSteps.stage');
  const formId = useId();
  const change = useChangeLeadSteps(onClose);
  const [name, setName] = useState('');
  useEffect(() => {
    if (draft) setName(draft.step?.name ?? '');
  }, [draft]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || name.trim().length < 2) return;
    if (draft.step)
      change.mutate({ kind: 'update', key: draft.step.key, body: { name: name.trim() } });
    else change.mutate({ kind: 'add', name: name.trim(), stage: draft.stage });
  };
  return (
    <Dialog
      open={draft !== null}
      onOpenChange={(open) => !open && onClose()}
      title={draft?.step ? t('editTitle', { name: draft.step.name }) : t('addTitle')}
      description={draft ? t('description', { stage: stageT(draft.stage) }) : undefined}
      autoFocusField
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            pending={change.isPending}
            disabled={name.trim().length < 2}
          >
            {draft?.step ? t('save') : t('add')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5 pb-2">
        <Field label={t('name')} hint={t('nameHint')} required>
          <Input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
