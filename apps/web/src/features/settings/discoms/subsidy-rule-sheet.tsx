'use client';

import type { SubsidyRuleVersion } from '@oneohm/api-contracts';
import { Button, Field, Input, Select, Sheet } from '@oneohm/design-system/web';
import type { SubsidyCategory } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { CircleCheck } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { useApiForm } from '@/lib/forms/use-api-form';
import { NumberInput } from '../number-input';
import { KwInput } from './kw-input';
import { SubsidyImpactList } from './subsidy-impact';
import {
  checkDraft,
  type Draft,
  draftFrom,
  editorCategories,
  slabsWouldBeLost,
} from './subsidy-rule-draft';
import { SubsidySlabsEditor } from './subsidy-slabs-editor';
import { useSubsidyRuleActions } from './use-subsidy-rules';

const inForce = (rules: readonly SubsidyRuleVersion[], category: SubsidyCategory) =>
  rules.find((rule) => rule.category === category && rule.state === 'in_force');

/**
 * Add a rule version, or change one that has not started. Once saved, the sheet shows the
 * open quotations whose expected subsidy would change. Mount with a fresh `key` per opening.
 */
export function SubsidyRuleSheet({
  open,
  editing,
  rules,
  onClose,
}: {
  readonly open: boolean;
  readonly editing: SubsidyRuleVersion | null;
  readonly rules: readonly SubsidyRuleVersion[];
  readonly onClose: () => void;
}) {
  const t = useTranslations('settings.subsidy');
  const checkT = useTranslations('checks');
  const format = useFormatter();
  const formId = useId();
  const form = useApiForm();
  const { save } = useSubsidyRuleActions();
  const today = todayIn();
  const [draft, setDraft] = useState<Draft>(() =>
    editing
      ? draftFrom(editing, editing.category, editing.validFrom)
      : draftFrom(inForce(rules, 'individual'), 'individual', addDays(today, 1)),
  );
  const [saved, setSaved] = useState<SubsidyRuleVersion | null>(null);
  const impactOn = saved ? (saved.validFrom > today ? saved.validFrom : today) : null;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const [missing, setMissing] = useState<readonly string[]>([]);
  const [switchTo, setSwitchTo] = useState<SubsidyCategory | null>(null);
  const required = Object.fromEntries(missing.map((field) => [field, checkT('required')]));
  const errors = { ...form.fieldErrors, ...required };

  const switchCategory = (category: SubsidyCategory) => {
    setSwitchTo(null);
    setDraft((current) =>
      editing
        ? { ...current, category }
        : draftFrom(inForce(rules, category), category, current.validFrom),
    );
  };
  // A new version copies the chosen category's rule in force; slabs typed so far would go.
  const pickCategory = (category: SubsidyCategory) => {
    const template = draftFrom(inForce(rules, draft.category), draft.category, '').slabs;
    if (!editing && slabsWouldBeLost(draft.slabs, template)) setSwitchTo(category);
    else switchCategory(category);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { body, missing: empty } = checkDraft(draft);
    setMissing(empty);
    if (!body) return;
    await form.run(() => save(editing?.id ?? null, body), setSaved);
  };

  const day = (date: string) => format.dateTime(new Date(date), { dateStyle: 'medium' });
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={impactOn ? t('impact.title') : editing ? t('form.editTitle') : t('form.createTitle')}
      description={impactOn ? t('impact.asOf', { date: day(impactOn) }) : t('form.intro')}
      width="lg"
      autoFocusField
      footer={
        impactOn ? (
          <Button variant="primary" onClick={onClose}>
            {t('impact.done')}
          </Button>
        ) : (
          <>
            <Button variant="quiet" onClick={onClose}>
              {t('form.cancel')}
            </Button>
            <Button type="submit" form={formId} variant="primary" pending={form.pending}>
              {t('form.save')}
            </Button>
          </>
        )
      }
    >
      {saved && impactOn ? (
        <div className="flex flex-col gap-5 px-5 py-5 sm:px-6">
          <p role="status" className="flex items-center gap-2 type-body-sm text-on-track">
            <CircleCheck aria-hidden className="size-4 shrink-0" />
            {t('form.saved', {
              category: t(`categories.${saved.category}`),
              date: day(saved.validFrom),
            })}
          </p>
          <SubsidyImpactList asOf={impactOn} />
        </div>
      ) : (
        <form
          id={formId}
          onSubmit={submit}
          noValidate
          className="flex flex-col gap-6 px-5 py-5 sm:px-6"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('form.category')} error={errors.category}>
              <Select
                value={draft.category}
                onValueChange={pickCategory}
                options={editorCategories(editing?.category ?? null).map((value) => ({
                  value,
                  label: t(`categories.${value}`),
                }))}
              />
            </Field>
            <Field
              label={t('form.validFrom')}
              hint={t('form.validFromHint')}
              error={errors.validFrom}
            >
              <Input
                type="date"
                min={today}
                value={draft.validFrom}
                onChange={(event) => set('validFrom', event.target.value)}
              />
            </Field>
          </div>
          {switchTo && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-xl border border-hairline bg-sunken/50 p-4"
            >
              <p className="type-body-sm text-ink">
                {t('form.switchWarning', { category: t(`categories.${switchTo}`) })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => switchCategory(switchTo)}>
                  {t('form.switchConfirm')}
                </Button>
                <Button size="sm" variant="quiet" onClick={() => setSwitchTo(null)}>
                  {t('form.switchKeep')}
                </Button>
              </div>
            </div>
          )}
          {draft.category === 'commercial' && (
            <p className="type-body-sm text-ink-muted">{t('commercialNote')}</p>
          )}
          <SubsidySlabsEditor
            slabs={draft.slabs}
            onChange={(slabs) => set('slabs', slabs)}
            errors={errors}
          />
          <Field label={t('form.cap')} error={errors.capPaise} className="sm:max-w-xs">
            <NumberInput
              unit="paise"
              value={draft.capPaise}
              onValueChange={(value) => set('capPaise', value)}
            />
          </Field>
          {draft.category === 'society' && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label={t('form.perHousehold')}
                hint={t('form.perHouseholdHint')}
                error={errors.perHouseholdWp}
              >
                <KwInput
                  value={draft.perHouseholdWp}
                  onValueChange={(value) => set('perHouseholdWp', value)}
                />
              </Field>
              <Field
                label={t('form.maxEligible')}
                hint={t('form.maxEligibleHint')}
                error={errors.maxEligibleWp}
              >
                <KwInput
                  value={draft.maxEligibleWp}
                  onValueChange={(value) => set('maxEligibleWp', value)}
                />
              </Field>
            </div>
          )}
          <FormError message={form.error} />
        </form>
      )}
    </Sheet>
  );
}
