'use client';

import type { Person, Role } from '@oneohm/api-contracts';
import { Field, Input } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { RolePicker } from './role-picker';

export interface PersonDraft {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly employeeCode: string;
  readonly designation: string;
  readonly password: string;
  readonly roleIds: readonly string[];
}

export const EMPTY_PERSON: PersonDraft = {
  fullName: '',
  email: '',
  phone: '',
  employeeCode: '',
  designation: '',
  password: '',
  roleIds: [],
};

export function draftFrom(person: Person): PersonDraft {
  return {
    fullName: person.fullName,
    email: person.email ?? '',
    phone: person.phone ?? '',
    employeeCode: person.employeeCode ?? '',
    designation: person.designation ?? '',
    password: '',
    roleIds: person.roles.map((role) => role.id),
  };
}

const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

/** The request body both forms send; blanks become "not set". */
export function bodyFrom(draft: PersonDraft) {
  return {
    fullName: draft.fullName,
    email: orNull(draft.email),
    phone: orNull(draft.phone),
    employeeCode: orNull(draft.employeeCode),
    designation: orNull(draft.designation),
    roleIds: [...draft.roleIds],
    ...(draft.password ? { password: draft.password } : {}),
  };
}

/** Name, sign-in details and roles: the same fields to add or edit a person. */
export function PersonFields({
  draft,
  onChange,
  roles,
  errors,
  mode,
}: {
  readonly draft: PersonDraft;
  readonly onChange: (next: PersonDraft) => void;
  readonly roles: readonly Role[];
  readonly errors: Readonly<Record<string, string>>;
  readonly mode: 'create' | 'edit';
}) {
  const t = useTranslations('team.form');
  const set = (key: keyof Omit<PersonDraft, 'roleIds'>) => (value: string) =>
    onChange({ ...draft, [key]: value });
  return (
    <div className="flex flex-col gap-5">
      <Field label={t('fullName')} error={errors.fullName} required>
        <Input
          value={draft.fullName}
          onChange={(event) => set('fullName')(event.target.value)}
          autoComplete="off"
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('email')} hint={t('emailHint')} error={errors.email}>
          <Input
            type="email"
            value={draft.email}
            onChange={(event) => set('email')(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label={t('phone')} hint={t('phoneHint')} error={errors.phone}>
          <Input
            type="tel"
            inputMode="tel"
            value={draft.phone}
            onChange={(event) => set('phone')(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label={t('employeeCode')} error={errors.employeeCode}>
          <Input
            value={draft.employeeCode}
            onChange={(event) => set('employeeCode')(event.target.value)}
            className="font-mono"
          />
        </Field>
        <Field label={t('designation')} error={errors.designation}>
          <Input
            value={draft.designation}
            onChange={(event) => set('designation')(event.target.value)}
          />
        </Field>
      </div>
      <Field
        label={mode === 'create' ? t('password') : t('newPassword')}
        hint={mode === 'create' ? t('passwordHint') : t('newPasswordHint')}
        error={errors.password}
      >
        <Input
          type="password"
          value={draft.password}
          onChange={(event) => set('password')(event.target.value)}
          autoComplete="new-password"
        />
      </Field>
      <RolePicker
        roles={roles}
        value={draft.roleIds}
        onChange={(roleIds) => onChange({ ...draft, roleIds })}
        error={errors.roleIds}
      />
    </div>
  );
}
