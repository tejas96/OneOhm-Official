'use client';

import type { Role } from '@oneohm/api-contracts';
import {
  Button,
  Checkbox,
  Field,
  Input,
  Sheet,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { ANNOUNCEMENTS_KEY } from './announcements-key';

/**
 * A short notice to the team (PRD 4.1): shown on the field app's Today screen until its
 * last day, and sent once as an alert. Everyone on the staff, or only some roles.
 */
export function AnnouncementSheet({
  open,
  onOpenChange,
  roles,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly roles: readonly Role[];
}) {
  const t = useTranslations('team.announcements.form');
  const formId = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useApiForm();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<string[]>([]);
  const [endsOn, setEndsOn] = useState('');
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setBody('');
    setAudience([]);
    setEndsOn('');
    reset();
  }, [open, reset]);

  const toggle = (key: string, on: boolean) =>
    setAudience((current) => (on ? [...current, key] : current.filter((item) => item !== key)));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await form.run(
      () =>
        expectStatus(
          api.engagement.createAnnouncement({
            body: { title, body, audienceRoleKeys: audience, endsOn: endsOn || null },
          }),
          201,
        ),
      async (created) => {
        await queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_KEY });
        toast({ title: t('posted'), reference: created.title, tone: 'success' });
        onOpenChange(false);
      },
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={t('description')}
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" pending={form.pending}>
            {t('post')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-6 px-5 py-6 sm:px-6"
      >
        <Field label={t('heading')} error={form.fieldErrors.title} required>
          <Input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label={t('body')} hint={t('bodyHint')} error={form.fieldErrors.body} required>
          <Textarea
            rows={4}
            maxLength={600}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
        <Field
          label={t('endsOn')}
          hint={t('endsOnHint')}
          error={form.fieldErrors.endsOn}
          className="max-w-xs"
        >
          <Input
            type="date"
            min={todayIn()}
            value={endsOn}
            onChange={(event) => setEndsOn(event.target.value)}
          />
        </Field>
        <fieldset className="flex flex-col gap-2 border-t border-hairline pt-6">
          <legend className="type-overline text-ink-faint uppercase">{t('audience')}</legend>
          <p className="type-body-sm text-ink-faint">
            {audience.length === 0 ? t('everyone') : t('onlyRoles', { count: audience.length })}
          </p>
          <div className="grid gap-1 sm:grid-cols-2">
            {roles
              .filter((role) => !role.archived)
              .map((role) => (
                <Checkbox
                  key={role.id}
                  checked={audience.includes(role.key)}
                  onCheckedChange={(on) => toggle(role.key, on)}
                  label={role.name}
                />
              ))}
          </div>
          {form.fieldErrors.audienceRoleKeys && (
            <p className="type-body-sm text-overdue">{form.fieldErrors.audienceRoleKeys}</p>
          )}
        </fieldset>
        <FormError message={form.error} />
      </form>
    </Sheet>
  );
}
