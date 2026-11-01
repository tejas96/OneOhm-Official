'use client';

import type { WorkLocationRecord } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, Switch, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { NumberInput } from '../number-input';
import { WORKFORCE_SETTINGS_KEY } from './use-workforce-settings';

const EMPTY = {
  name: '',
  latitude: '',
  longitude: '',
  radiusM: 150 as number | null,
  active: true,
};

/** "16.8524" → 16.8524; anything that is not a number → null. */
const decimal = (text: string) => {
  const value = Number(text.trim());
  return text.trim() === '' || !Number.isFinite(value) ? null : value;
};

/** Add or change one authorised place; it is saved straight away. */
export function PlaceDialog({
  open,
  place,
  onClose,
}: {
  readonly open: boolean;
  /** null adds a new place. */
  readonly place: WorkLocationRecord | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('settings.workforce.places.dialog');
  const formId = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useApiForm();
  const [draft, setDraft] = useState(EMPTY);
  const [checked, setChecked] = useState(false);
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    setDraft(
      place
        ? { ...place, latitude: String(place.latitude), longitude: String(place.longitude) }
        : EMPTY,
    );
    setChecked(false);
    reset();
  }, [open, place, reset]);

  const latitude = decimal(draft.latitude);
  const longitude = decimal(draft.longitude);
  const errors = form.fieldErrors;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setChecked(true);
    if (latitude === null || longitude === null) return;
    const body = {
      name: draft.name.trim(),
      latitude,
      longitude,
      radiusM: draft.radiusM ?? 0,
      active: draft.active,
    };
    const saved = await form.run(() =>
      place
        ? expectStatus(api.rewards.updateWorkLocation({ params: { id: place.id }, body }), 200)
        : expectStatus(api.rewards.addWorkLocation({ body }), 201),
    );
    if (!saved) return;
    queryClient.setQueryData(WORKFORCE_SETTINGS_KEY, saved);
    toast({ title: place ? t('updated') : t('added'), reference: body.name, tone: 'success' });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={place ? t('editTitle', { name: place.name }) : t('addTitle')}
      description={t('description')}
      autoFocusField
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" pending={form.pending}>
            {place ? t('save') : t('add')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5 pb-2">
        <Field label={t('name')} required error={errors.name}>
          <Input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label={t('latitude')}
            required
            error={errors.latitude ?? (checked && latitude === null ? t('numberError') : null)}
          >
            <Input
              inputMode="decimal"
              value={draft.latitude}
              placeholder="16.8524"
              className="font-mono"
              onChange={(event) => setDraft({ ...draft, latitude: event.target.value })}
            />
          </Field>
          <Field
            label={t('longitude')}
            required
            error={errors.longitude ?? (checked && longitude === null ? t('numberError') : null)}
          >
            <Input
              inputMode="decimal"
              value={draft.longitude}
              placeholder="74.5815"
              className="font-mono"
              onChange={(event) => setDraft({ ...draft, longitude: event.target.value })}
            />
          </Field>
        </div>
        <p className="-mt-2 type-body-sm text-ink-faint">{t('coordinatesHint')}</p>
        <Field
          label={t('radius')}
          hint={t('radiusHint')}
          error={errors.radiusM}
          className="max-w-48"
        >
          <NumberInput
            unit="whole"
            value={draft.radiusM}
            onValueChange={(radiusM) => setDraft({ ...draft, radiusM })}
          />
        </Field>
        <Switch
          checked={draft.active}
          onCheckedChange={(active) => setDraft({ ...draft, active })}
          label={t('active')}
          description={t('activeHint')}
        />
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
