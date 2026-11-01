'use client';

import { Button, Dialog, Field, Select, Textarea, useToast } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { NumberInput } from '@/features/settings/number-input';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useCurrentUser } from '@/providers/current-user';
import { usePeople } from '../use-team';
import { useGivePoints } from './use-points';

/** A manager thanks someone with points, up to the limit set in Settings, and says why. */
export function GivePointsDialog({
  open,
  onOpenChange,
  max,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly max: number;
}) {
  const t = useTranslations('team.points.give');
  const formId = useId();
  const me = useCurrentUser();
  const people = usePeople();
  const give = useGivePoints();
  const toast = useToast();
  const form = useApiForm();
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [points, setPoints] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    setUserId(undefined);
    setPoints(null);
    setReason('');
    reset();
  }, [open, reset]);

  const options = (people.data ?? [])
    .filter((person) => person.status === 'active' && person.id !== me.id)
    .map((person) => ({
      value: person.id,
      label: person.fullName,
      ...(person.designation ? { description: person.designation } : {}),
    }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const given = await form.run(() =>
      give({ userId: userId ?? '', points: points ?? 0, reason: reason.trim() }),
    );
    if (!given) return;
    toast({
      title: t('given', { count: given.points, name: given.user.fullName }),
      tone: 'success',
    });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={t('description')}
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            pending={form.pending}
            disabled={!userId}
          >
            {t('submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5 pb-2">
        <Field label={t('person')} required error={form.fieldErrors.userId}>
          <Select
            value={userId}
            onValueChange={setUserId}
            options={options}
            placeholder={t('personPlaceholder')}
          />
        </Field>
        <Field
          label={t('points')}
          required
          hint={t('pointsHint', { max })}
          error={form.fieldErrors.points}
          className="max-w-xs"
        >
          <NumberInput unit="whole" value={points} onValueChange={setPoints} />
        </Field>
        <Field label={t('reason')} required hint={t('reasonHint')} error={form.fieldErrors.reason}>
          <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
