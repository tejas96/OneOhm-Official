'use client';

import { Checkbox, Field, Input, SegmentedControl, Textarea } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import type { BankCheck } from '@/features/inventory/vendors/bank-check';
import { VendorBankFields } from '@/features/inventory/vendors/vendor-bank-fields';
import { NumberInput } from '@/features/settings/number-input';
import { useRoles } from '@/features/team/use-team';
import type { ContractorDraft } from './contractor-draft';

export {
  type ContractorDraft,
  contractorBody,
  draftFrom,
  EMPTY_CONTRACTOR,
} from './contractor-draft';

/** Profile, bank, money terms and the kinds of work a contractor's crews take. */
export function ContractorFields({
  draft,
  onChange,
  errors,
  savedAccount = null,
  bank,
  showRequired = false,
}: {
  readonly draft: ContractorDraft;
  readonly onChange: (draft: ContractorDraft) => void;
  readonly errors: Readonly<Record<string, string>>;
  /** The saved account number, masked; typing a new one replaces it. */
  readonly savedAccount?: string | null;
  /** The live check of the bank fields; the form refuses to save while it is blocked. */
  readonly bank: BankCheck;
  readonly showRequired?: boolean;
}) {
  const t = useTranslations('contractors.form');
  const roles = useRoles();
  const set = <K extends keyof ContractorDraft>(key: K, value: ContractorDraft[K]) =>
    onChange({ ...draft, [key]: value });
  const text = (key: keyof ContractorDraft & string, extra?: { type?: string; mono?: boolean }) => (
    <Field label={t(`fields.${key}`)} error={errors[key]}>
      <Input
        type={extra?.type ?? 'text'}
        value={String(draft[key] ?? '')}
        onChange={(event) => set(key, event.target.value as never)}
        className={extra?.mono ? 'font-mono uppercase' : undefined}
      />
    </Field>
  );
  const skillRoles = (roles.data ?? []).filter(
    (role) => !role.archived && role.kind !== 'reseller',
  );
  return (
    <div className="flex flex-col gap-6">
      <SegmentedControl
        label={t('fields.kind')}
        value={draft.kind}
        onValueChange={(kind) => set('kind', kind)}
        options={[
          { value: 'company', label: t('kinds.company') },
          { value: 'individual', label: t('kinds.individual') },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">{text('name')}</div>
        {text('contactName')}
        {text('phone', { type: 'tel' })}
        {text('email', { type: 'email' })}
        {text('gstin', { mono: true })}
        {text('pan', { mono: true })}
        <div className="sm:col-span-2">{text('address')}</div>
      </div>
      <VendorBankFields
        values={draft}
        onChange={(key, value) => set(key, value)}
        check={bank}
        errors={errors}
        showRequired={showRequired}
        savedAccount={savedAccount}
      />
      <fieldset className="grid gap-4 sm:grid-cols-4">
        <legend className="mb-3 type-overline text-ink-faint uppercase">{t('terms')}</legend>
        <Field label={t('fields.paymentTermsDays')} error={errors.paymentTermsDays}>
          <NumberInput
            unit="whole"
            value={draft.paymentTermsDays}
            onValueChange={(value) => set('paymentTermsDays', value)}
          />
        </Field>
        <Field label={t('fields.tdsBp')} error={errors.tdsBp}>
          <NumberInput
            unit="basisPoints"
            value={draft.tdsBp}
            onValueChange={(value) => set('tdsBp', value)}
          />
        </Field>
        <Field label={t('fields.retentionBp')} error={errors.retentionBp}>
          <NumberInput
            unit="basisPoints"
            value={draft.retentionBp}
            onValueChange={(value) => set('retentionBp', value)}
          />
        </Field>
        <Field label={t('fields.retentionDays')} error={errors.retentionDays}>
          <NumberInput
            unit="whole"
            value={draft.retentionDays}
            onValueChange={(value) => set('retentionDays', value)}
          />
        </Field>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 type-overline text-ink-faint uppercase">{t('skills')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {skillRoles.map((role) => (
            <Checkbox
              key={role.key}
              label={role.name}
              checked={draft.skills.includes(role.key)}
              onCheckedChange={(checked) =>
                set(
                  'skills',
                  checked
                    ? [...draft.skills, role.key]
                    : draft.skills.filter((key) => key !== role.key),
                )
              }
            />
          ))}
        </div>
        {errors.skills && <p className="type-body-sm text-overdue">{errors.skills}</p>}
      </fieldset>
      <Field
        label={t('fields.serviceAreas')}
        hint={t('serviceAreasHint')}
        error={errors.serviceAreas}
      >
        <Input
          value={draft.serviceAreas}
          onChange={(event) => set('serviceAreas', event.target.value)}
        />
      </Field>
      <Field label={t('fields.notes')} error={errors.notes}>
        <Textarea
          value={draft.notes}
          rows={3}
          onChange={(event) => set('notes', event.target.value)}
        />
      </Field>
    </div>
  );
}
