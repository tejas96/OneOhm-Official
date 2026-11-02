'use client';

import type { StateSubsidyVersion } from '@oneohm/api-contracts';
import { Button, Field, Input, Sheet, useToast } from '@oneohm/design-system/web';
import { addDays, todayIn } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { useApiForm } from '@/lib/forms/use-api-form';
import { NumberInput } from '../number-input';
import { useStateRuleActions } from './use-state-rules';

interface Draft {
  readonly validFrom: string;
  readonly paisePerKw: number | null;
  readonly capPaise: number | null;
}

/**
 * Add a version of the state top-up, or change one that has not started. Mount with a
 * fresh `key` per opening; a new version starts from the one in force.
 */
export function StateRuleSheet({
  open,
  editing,
  current,
  onClose,
}: {
  readonly open: boolean;
  readonly editing: StateSubsidyVersion | null;
  readonly current: StateSubsidyVersion | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('stateSupport.form');
  const formId = useId();
  const form = useApiForm();
  const toast = useToast();
  const { save } = useStateRuleActions();
  const today = todayIn();
  const from = editing ?? current;
  const [draft, setDraft] = useState<Draft>({
    validFrom: editing?.validFrom ?? addDays(today, 1),
    paisePerKw: from?.paisePerKw ?? null,
    capPaise: from?.capPaise ?? null,
  });
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((now) => ({ ...now, [key]: value }));
  const errors = form.fieldErrors;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = {
      validFrom: draft.validFrom,
      paisePerKw: draft.paisePerKw ?? 0,
      capPaise: draft.capPaise ?? 0,
    };
    await form.run(
      () => save(editing?.id ?? null, body),
      () => {
        toast({ tone: 'success', title: t('saved') });
        onClose();
      },
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={editing ? t('editTitle') : t('createTitle')}
      description={t('intro')}
      autoFocusField
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" pending={form.pending}>
            {t('save')}
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
        <Field label={t('validFrom')} hint={t('validFromHint')} error={errors.validFrom}>
          <Input
            type="date"
            min={today}
            value={draft.validFrom}
            onChange={(event) => set('validFrom', event.target.value)}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('perKw')} hint={t('perKwHint')} error={errors.paisePerKw}>
            <NumberInput
              unit="paise"
              value={draft.paisePerKw}
              onValueChange={(value) => set('paisePerKw', value)}
            />
          </Field>
          <Field label={t('cap')} hint={t('capHint')} error={errors.capPaise}>
            <NumberInput
              unit="paise"
              value={draft.capPaise}
              onValueChange={(value) => set('capPaise', value)}
            />
          </Field>
        </div>
        <p className="type-body-sm text-ink-muted">{t('who')}</p>
        <FormError message={form.error} />
      </form>
    </Sheet>
  );
}
