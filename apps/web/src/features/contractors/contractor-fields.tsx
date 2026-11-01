'use client';

import type { ContractorDetail, ContractorInput } from '@oneohm/api-contracts';
import { Checkbox, Field, Input, SegmentedControl, Textarea } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { NumberInput } from '@/features/settings/number-input';
import { useRoles } from '@/features/team/use-team';

export interface ContractorDraft {
  readonly name: string;
  readonly kind: 'company' | 'individual';
  readonly contactName: string;
  readonly phone: string;
  readonly email: string;
  readonly gstin: string;
  readonly pan: string;
  readonly address: string;
  readonly bankAccountName: string;
  readonly bankAccountNumber: string;
  readonly bankIfsc: string;
  readonly paymentTermsDays: number | null;
  readonly tdsBp: number | null;
  readonly retentionBp: number | null;
  readonly retentionDays: number | null;
  readonly skills: readonly string[];
  readonly serviceAreas: string;
  readonly notes: string;
}

export const EMPTY_CONTRACTOR: ContractorDraft = {
  name: '',
  kind: 'company',
  contactName: '',
  phone: '',
  email: '',
  gstin: '',
  pan: '',
  address: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankIfsc: '',
  paymentTermsDays: 15,
  tdsBp: 100,
  retentionBp: 0,
  retentionDays: 90,
  skills: ['ic_partner'],
  serviceAreas: '',
  notes: '',
};

export function draftFrom(contractor: ContractorDetail): ContractorDraft {
  return {
    name: contractor.name,
    kind: contractor.kind,
    contactName: contractor.contactName ?? '',
    phone: contractor.phone?.replace(/^\+91/, '') ?? '',
    email: contractor.email ?? '',
    gstin: contractor.gstin ?? '',
    pan: contractor.pan ?? '',
    address: contractor.address ?? '',
    bankAccountName: contractor.bankAccountName ?? '',
    bankAccountNumber: contractor.bankAccountNumber ?? '',
    bankIfsc: contractor.bankIfsc ?? '',
    paymentTermsDays: contractor.paymentTermsDays,
    tdsBp: contractor.tdsBp,
    retentionBp: contractor.retentionBp,
    retentionDays: contractor.retentionDays,
    skills: contractor.skills,
    serviceAreas: contractor.serviceAreas.join(', '),
    notes: contractor.notes ?? '',
  };
}

const orNull = (value: string) => (value.trim() ? value.trim() : null);

/** The API body; blank optional fields are sent as null so they clear. */
export function contractorBody(draft: ContractorDraft): ContractorInput {
  return {
    name: draft.name.trim(),
    kind: draft.kind,
    contactName: orNull(draft.contactName),
    phone: orNull(draft.phone),
    email: orNull(draft.email),
    gstin: orNull(draft.gstin),
    pan: orNull(draft.pan),
    address: orNull(draft.address),
    bankAccountName: orNull(draft.bankAccountName),
    bankAccountNumber: orNull(draft.bankAccountNumber),
    bankIfsc: orNull(draft.bankIfsc),
    paymentTermsDays: draft.paymentTermsDays ?? 0,
    tdsBp: draft.tdsBp ?? 0,
    retentionBp: draft.retentionBp ?? 0,
    retentionDays: draft.retentionDays ?? 0,
    skills: [...draft.skills],
    serviceAreas: draft.serviceAreas
      .split(',')
      .map((area) => area.trim())
      .filter(Boolean),
    notes: orNull(draft.notes),
  };
}

/** Profile, bank, money terms and the kinds of work a contractor's crews take. */
export function ContractorFields({
  draft,
  onChange,
  errors,
}: {
  readonly draft: ContractorDraft;
  readonly onChange: (draft: ContractorDraft) => void;
  readonly errors: Readonly<Record<string, string>>;
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
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-3 type-overline text-ink-faint uppercase">{t('bank')}</legend>
        {text('bankAccountName')}
        {text('bankAccountNumber', { mono: true })}
        {text('bankIfsc', { mono: true })}
      </fieldset>
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
