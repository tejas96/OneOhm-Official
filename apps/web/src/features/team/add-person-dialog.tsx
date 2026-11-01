'use client';

import type { Role } from '@oneohm/api-contracts';
import { Button, Dialog, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { bodyFrom, EMPTY_PERSON, PersonFields } from './person-fields';
import { PEOPLE_KEY, ROLES_KEY } from './use-team';

/** Adds someone who can sign in straight away. */
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
  const formId = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useApiForm();
  const [draft, setDraft] = useState(EMPTY_PERSON);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setDraft(EMPTY_PERSON);
      form.reset();
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const created = await form.run(() =>
      expectStatus(api.people.createPerson({ body: bodyFrom(draft) }), 201),
    );
    if (!created) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: PEOPLE_KEY }),
      queryClient.invalidateQueries({ queryKey: ROLES_KEY }),
    ]);
    toast({ title: t('added', { name: created.fullName }), tone: 'success' });
    close(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={t('title')}
      description={t('description')}
      size="lg"
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {t('submit')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <PersonFields
          draft={draft}
          onChange={setDraft}
          roles={roles}
          errors={form.fieldErrors}
          mode="create"
        />
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
