'use client';

import type { ChangeRequestDetail, ChangeRequestStepView } from '@oneohm/api-contracts';
import { Field, Input, Select, Textarea } from '@oneohm/design-system/web';
import { WAITING_PARTIES, type WaitingParty } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { StepDialog, useStepSave } from './step-dialog-shell';

/** Waiting on the DISCOM (or the customer): the reference number and the next follow-up. */
export function WaitStepDialog({
  request,
  step,
  onClose,
}: {
  readonly request: ChangeRequestDetail;
  readonly step: ChangeRequestStepView;
  readonly onClose: () => void;
}) {
  const t = useTranslations('discom.stepDialogs.wait');
  const partyT = useTranslations('commandCenter.party');
  const { form, save } = useStepSave(onClose);
  const [party, setParty] = useState<WaitingParty>(
    step.waitingParty === 'internal' ? 'discom' : step.waitingParty,
  );
  const [reference, setReference] = useState(request.referenceNumber ?? '');
  const [next, setNext] = useState(step.nextFollowUpOn ?? '');
  const [note, setNote] = useState(step.note ?? '');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save(
      () =>
        expectStatus(
          api.discom.waitChangeRequestStep({
            params: { id: request.id, stepId: step.id },
            body: {
              party,
              ...(party === 'discom' ? { referenceNumber: reference.trim() || null } : {}),
              nextFollowUpOn: next || null,
              note: note.trim() || null,
            },
          }),
          200,
        ),
      t('done'),
    );
  };
  return (
    <StepDialog
      title={t('title')}
      description={step.title}
      submit={t('submit')}
      onClose={onClose}
      form={form}
      onSubmit={submit}
    >
      <Field label={t('party')}>
        <Select
          value={party}
          onValueChange={setParty}
          options={WAITING_PARTIES.filter(
            (value) => value === 'customer' || value === 'discom',
          ).map((value) => ({
            value,
            label: partyT(value),
          }))}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {party === 'discom' && (
          <Field label={t('reference')} error={form.fieldErrors.referenceNumber}>
            <Input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className="font-mono"
            />
          </Field>
        )}
        <Field label={t('next')} error={form.fieldErrors.nextFollowUpOn}>
          <Input type="date" value={next} onChange={(event) => setNext(event.target.value)} />
        </Field>
      </div>
      <Field label={t('note')}>
        <Textarea value={note} rows={2} onChange={(event) => setNote(event.target.value)} />
      </Field>
    </StepDialog>
  );
}

/** Completing a step records what it captures; the last step updates the site. */
export function CompleteStepDialog({
  request,
  step,
  onClose,
}: {
  readonly request: ChangeRequestDetail;
  readonly step: ChangeRequestStepView;
  readonly onClose: () => void;
}) {
  const t = useTranslations('discom.stepDialogs.complete');
  const captureT = useTranslations('discom.captures');
  const { form, save } = useStepSave(onClose);
  const [facts, setFacts] = useState<Record<string, string>>(() =>
    Object.fromEntries(step.captures.map((key) => [key, request.captured[key] ?? ''])),
  );
  const [note, setNote] = useState('');
  const last = request.steps.at(-1)?.id === step.id;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save(
      () =>
        expectStatus(
          api.discom.completeChangeRequestStep({
            params: { id: request.id, stepId: step.id },
            body: { facts, note: note.trim() || null },
          }),
          200,
        ),
      last ? t('applied') : t('done'),
    );
  };
  return (
    <StepDialog
      title={t('title')}
      description={last ? t('lastHint') : step.title}
      submit={last ? t('submitLast') : t('submit')}
      onClose={onClose}
      form={form}
      onSubmit={submit}
    >
      {step.captures.map((key) => (
        <Field key={key} label={captureT(key)} required error={form.fieldErrors[key]}>
          <Input
            value={facts[key] ?? ''}
            onChange={(event) => setFacts({ ...facts, [key]: event.target.value })}
            className="font-mono"
          />
        </Field>
      ))}
      <Field label={t('note')}>
        <Textarea value={note} rows={2} onChange={(event) => setNote(event.target.value)} />
      </Field>
    </StepDialog>
  );
}

export function CancelRequestDialog({
  request,
  onClose,
}: {
  readonly request: ChangeRequestDetail;
  readonly onClose: () => void;
}) {
  const t = useTranslations('discom.stepDialogs.cancel');
  const { form, save } = useStepSave(onClose);
  const [reason, setReason] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save(
      () =>
        expectStatus(
          api.discom.cancelChangeRequest({ params: { id: request.id }, body: { reason } }),
          200,
        ),
      t('done'),
    );
  };
  return (
    <StepDialog
      title={t('title')}
      description={t('description')}
      submit={t('submit')}
      danger
      onClose={onClose}
      form={form}
      onSubmit={submit}
    >
      <Field label={t('reason')} error={form.fieldErrors.reason}>
        <Textarea value={reason} rows={3} onChange={(event) => setReason(event.target.value)} />
      </Field>
    </StepDialog>
  );
}
