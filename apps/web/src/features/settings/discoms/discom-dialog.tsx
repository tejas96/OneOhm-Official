'use client';

import type { Discom, DiscomInput } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, Switch, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { NumberInput } from '../number-input';
import { SETTINGS_KEYS } from '../use-settings';

const BLANK: DiscomInput = { code: '', name: '', state: '', expectedDays: 30, active: true };

/** Add or edit a DISCOM; `discom` null with `open` adds. */
export function DiscomDialog({
  open,
  discom,
  onClose,
}: {
  readonly open: boolean;
  readonly discom: Discom | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('settings.discoms.dialog');
  const settingsT = useTranslations('settings');
  const formId = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useApiForm();
  const [draft, setDraft] = useState<DiscomInput>(BLANK);
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    setDraft(discom ? { ...discom } : BLANK);
    reset();
  }, [open, discom, reset]);

  const set = <K extends keyof DiscomInput>(key: K, value: DiscomInput[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body: DiscomInput = {
      code: draft.code,
      name: draft.name,
      state: draft.state,
      expectedDays: draft.expectedDays,
      active: draft.active,
    };
    await form.run(
      () =>
        discom
          ? expectStatus(api.catalog.updateDiscom({ params: { id: discom.id }, body }), 200)
          : expectStatus(api.catalog.createDiscom({ body }), 201),
      async (saved) => {
        await queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.discoms });
        toast({
          title: discom ? t('updated', { name: saved.code }) : t('created', { name: saved.code }),
          tone: 'success',
        });
        onClose();
      },
    );
  };

  const errors = form.fieldErrors;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={discom ? t('editTitle') : t('createTitle')}
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {discom ? settingsT('save') : t('create')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <Field label={t('code')} error={errors.code} required>
            <Input
              value={draft.code}
              onChange={(event) => set('code', event.target.value)}
              className="font-mono uppercase"
            />
          </Field>
          <Field label={t('state')} error={errors.state} required>
            <Input value={draft.state} onChange={(event) => set('state', event.target.value)} />
          </Field>
        </div>
        <Field label={t('name')} error={errors.name} required>
          <Input value={draft.name} onChange={(event) => set('name', event.target.value)} />
        </Field>
        <Field label={t('expectedDays')} error={errors.expectedDays} className="max-w-xs">
          <NumberInput
            unit="whole"
            value={draft.expectedDays}
            onValueChange={(value) => set('expectedDays', value ?? 0)}
          />
        </Field>
        <Switch
          checked={draft.active}
          onCheckedChange={(value) => set('active', value)}
          label={t('active')}
        />
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
