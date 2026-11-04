'use client';

import type { Person } from '@oneohm/api-contracts';
import { Button, Dialog, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { PEOPLE_KEY } from './use-team';

/**
 * The admin's password reset: one button, one confirm. It clears their web password,
 * signs them out everywhere and sends the invite again; the admin never types a password.
 */
export function RequireNewPassword({ person }: { readonly person: Person }) {
  const t = useTranslations('team.editSheet.requireNewPassword');
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useApiForm();
  const [confirming, setConfirming] = useState(false);

  const close = () => {
    setConfirming(false);
    form.reset();
  };

  const confirm = () =>
    form.run(
      () =>
        expectStatus(
          api.people.updatePerson({
            params: { id: person.id },
            body: { requireNewPassword: true },
          }),
          200,
        ),
      async () => {
        await queryClient.invalidateQueries({ queryKey: PEOPLE_KEY });
        toast({ title: t('done'), reference: person.fullName, tone: 'success' });
        close();
      },
    );

  return (
    <>
      <Button
        variant="secondary"
        leadingIcon={<KeyRound />}
        onClick={() => setConfirming(true)}
        className="self-start"
      >
        {t('button')}
      </Button>
      <Dialog
        open={confirming}
        onOpenChange={(next) => !next && close()}
        title={t('title', { name: person.fullName })}
        size="sm"
        footer={
          <>
            <Button variant="quiet" onClick={close}>
              {t('cancel')}
            </Button>
            <Button variant="danger" pending={form.pending} onClick={confirm}>
              {t('confirm')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 pb-2">
          <p className="type-body-sm text-ink-muted">{t('body')}</p>
          <FormError message={form.error} />
        </div>
      </Dialog>
    </>
  );
}
