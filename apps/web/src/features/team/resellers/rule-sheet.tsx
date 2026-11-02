'use client';

import type { CommissionRule, CommissionRuleInput } from '@oneohm/api-contracts';
import {
  Button,
  Field,
  SegmentedControl,
  Select,
  Sheet,
  Switch,
  useToast,
} from '@oneohm/design-system/web';
import { COMMISSION_BASES, QUALIFYING_EVENTS } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { NumberInput } from '@/features/settings/number-input';
import { useApiForm } from '@/lib/forms/use-api-form';
import { type RuleTarget, useSaveCommissionRule } from './use-resellers';

const inputOf = (rule: CommissionRule): CommissionRuleInput => ({
  basis: rule.basis,
  rateBp: rule.rateBp,
  perKwPaise: rule.perKwPaise,
  qualifyingEvent: rule.qualifyingEvent,
  active: rule.active,
});

/** Edits the default commission rule, or one reseller's own rule (PRD 4.8). */
export function RuleSheet({
  editing,
  onClose,
}: {
  readonly editing: { target: RuleTarget; rule: CommissionRule; custom: boolean } | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('team.resellers.sheet');
  const formId = useId();
  const toast = useToast();
  const form = useApiForm();
  const save = useSaveCommissionRule();
  const [draft, setDraft] = useState<CommissionRuleInput | null>(null);

  useEffect(() => {
    setDraft(editing ? inputOf(editing.rule) : null);
    form.reset();
  }, [editing, form.reset]);

  const target = editing?.target ?? null;
  const run = async (rule: CommissionRuleInput | 'default') => {
    await form.run(
      () => save.mutateAsync({ target, rule }),
      () => {
        toast({
          title: rule === 'default' ? t('reverted') : t('saved'),
          description: target?.fullName ?? t('defaultName'),
          tone: 'success',
        });
        onClose();
      },
    );
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft) void run(draft);
  };
  const patch = (next: Partial<CommissionRuleInput>) => draft && setDraft({ ...draft, ...next });

  return (
    <Sheet
      open={editing !== null}
      onOpenChange={(open) => !open && onClose()}
      title={target ? t('titleFor', { name: target.fullName }) : t('titleDefault')}
      description={target ? t('descriptionFor') : t('descriptionDefault')}
      autoFocusField
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {target && editing?.custom && (
            <Button
              variant="quiet"
              className="mr-auto"
              pending={form.pending && save.variables?.rule === 'default'}
              onClick={() => void run('default')}
            >
              {t('useDefault')}
            </Button>
          )}
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" pending={form.pending}>
            {t('save')}
          </Button>
        </div>
      }
    >
      {draft && (
        <form
          id={formId}
          onSubmit={submit}
          noValidate
          className="flex flex-col gap-5 px-5 py-6 sm:px-6"
        >
          <Switch
            checked={draft.active}
            onCheckedChange={(active) => patch({ active })}
            label={t('active')}
            description={t('activeHint')}
          />
          <div className="flex flex-col gap-1.5">
            <span className="type-label text-ink-muted">{t('basis')}</span>
            <SegmentedControl
              label={t('basis')}
              size="sm"
              value={draft.basis}
              onValueChange={(basis) => patch({ basis })}
              options={COMMISSION_BASES.map((value) => ({ value, label: t(`bases.${value}`) }))}
              className="self-start"
            />
          </div>
          {draft.basis === 'percent' ? (
            <Field label={t('rate')} hint={t('rateHint')} required error={form.fieldErrors.rateBp}>
              <NumberInput
                unit="basisPoints"
                value={draft.rateBp}
                onValueChange={(value) => patch({ rateBp: value ?? 0 })}
              />
            </Field>
          ) : (
            <Field
              label={t('perKw')}
              hint={t('perKwHint')}
              required
              error={form.fieldErrors.perKwPaise}
            >
              <NumberInput
                unit="paise"
                value={draft.perKwPaise}
                onValueChange={(value) => patch({ perKwPaise: value ?? 0 })}
              />
            </Field>
          )}
          <Field label={t('event')} hint={t('eventHint')} error={form.fieldErrors.qualifyingEvent}>
            <Select
              value={draft.qualifyingEvent}
              onValueChange={(qualifyingEvent) => patch({ qualifyingEvent })}
              options={QUALIFYING_EVENTS.map((value) => ({ value, label: t(`events.${value}`) }))}
            />
          </Field>
          <FormError message={form.error} />
        </form>
      )}
    </Sheet>
  );
}
