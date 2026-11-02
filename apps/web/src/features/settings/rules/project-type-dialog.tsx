'use client';

import type { ProjectVariantRecord } from '@oneohm/api-contracts';
import {
  Button,
  Dialog,
  Field,
  Input,
  Switch,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { RULE_KEYS } from './use-rule-settings';

/** Rename and describe a kind of project, or switch it off for new projects. */
export function ProjectTypeDialog({
  variant,
  onClose,
}: {
  readonly variant: ProjectVariantRecord | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('settings.rules.projectTypes.dialog');
  const settingsT = useTranslations('settings');
  const formId = useId();
  const toast = useToast();
  const client = useQueryClient();
  const form = useApiForm();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!variant) return;
    setName(variant.name);
    setDescription(variant.description);
    setActive(variant.active);
    form.reset();
  }, [variant, form.reset]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!variant) return;
    await form.run(
      () =>
        expectStatus(
          api.businessSettings.saveProjectVariant({
            params: { key: variant.key },
            body: { name, description, active },
          }),
          200,
        ),
      async (saved) => {
        await client.invalidateQueries({ queryKey: RULE_KEYS.projectTypes });
        toast({ title: settingsT('saved'), reference: saved.name, tone: 'success' });
        onClose();
      },
    );
  };

  return (
    <Dialog
      open={variant !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('title', { name: variant?.name ?? '' })}
      description={t('description')}
      autoFocusField
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {settingsT('cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" pending={form.pending}>
            {settingsT('save')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Field label={t('name')} error={form.fieldErrors.name} required>
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
        </Field>
        <Field label={t('about')} hint={t('aboutHint')} error={form.fieldErrors.description}>
          <Textarea
            value={description}
            rows={3}
            maxLength={240}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Switch
          checked={active}
          onCheckedChange={setActive}
          label={t('offered')}
          description={t('offeredHint', { count: variant?.projects ?? 0 })}
        />
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
