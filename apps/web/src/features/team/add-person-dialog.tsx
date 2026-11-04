'use client';

import type { Person, Role } from '@oneohm/api-contracts';
import { Button, Dialog, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { type PastMember, pastMemberOf } from './past-member';
import { PastMemberPrompt } from './past-member-prompt';
import { bodyFrom, EMPTY_PERSON, type PersonDraft, PersonFields } from './person-fields';
import { PEOPLE_KEY, ROLES_KEY } from './use-team';

/** Adds someone by mobile number; they get a WhatsApp invite and set their own password. */
export function AddPersonDialog({
  open,
  onOpenChange,
  roles,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly roles: readonly Role[];
}) {
  const t = useTranslations('team.addDialog');
  const tForm = useTranslations('team.form');
  const formId = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useApiForm();
  const [draft, setDraft] = useState(EMPTY_PERSON);
  const [phoneMissing, setPhoneMissing] = useState(false);
  const [pastMember, setPastMember] = useState<PastMember | null>(null);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setDraft(EMPTY_PERSON);
      setPhoneMissing(false);
      setPastMember(null);
      form.reset();
    }
  };

  const change = (next: PersonDraft) => {
    if (next.phone !== draft.phone) {
      setPhoneMissing(false);
      setPastMember(null);
    }
    setDraft(next);
  };

  const create = () =>
    expectStatus(
      api.people.createPerson({ body: { ...bodyFrom(draft), phone: draft.phone.trim() } }),
      201,
    );

  const added = async (created: Person | null) => {
    if (!created) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: PEOPLE_KEY }),
      queryClient.invalidateQueries({ queryKey: ROLES_KEY }),
    ]);
    toast({ title: t('added', { name: created.fullName }), tone: 'success' });
    close(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.phone.trim() === '') {
      setPhoneMissing(true);
      return;
    }
    setPastMember(null);
    await form.run(async () => {
      try {
        return await create();
      } catch (caught) {
        const past = pastMemberOf(caught);
        if (!past) throw caught;
        setPastMember(past);
        return null;
      }
    }, added);
  };

  /** Takes the number off the past member's record, then adds the new person with it. */
  const giveNumber = async () => {
    if (!pastMember) return;
    const from = pastMember.userId;
    await form.run(async () => {
      await expectStatus(api.people.releasePhone({ params: { id: from } }), 200);
      setPastMember(null);
      return create();
    }, added);
  };

  const errors = phoneMissing
    ? { ...form.fieldErrors, phone: tForm('phoneRequired') }
    : form.fieldErrors;

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={t('title')}
      description={t('description')}
      size="lg"
      autoFocusField
      footer={
        <Button
          type="submit"
          form={formId}
          variant="primary"
          pending={form.pending && !pastMember}
          disabled={pastMember !== null}
        >
          {t('submit')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <PersonFields draft={draft} onChange={change} roles={roles} errors={errors} phoneRequired />
        {pastMember && (
          <PastMemberPrompt member={pastMember} pending={form.pending} onGiveNumber={giveNumber} />
        )}
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
