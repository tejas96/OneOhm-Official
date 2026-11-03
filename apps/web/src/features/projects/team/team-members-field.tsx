'use client';

import type { TeamOptions } from '@oneohm/api-contracts';
import { Checkbox, Field } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';

/**
 * Staff named for the project: in-house tasks go to them first. None picked means
 * anyone in the company, so a small office never has to fill this in.
 */
export function TeamMembersField({
  people,
  current = [],
  value,
  onChange,
  error,
}: {
  readonly people: TeamOptions['people'];
  /** The project's team today: anyone missing from `people` (left) can still be unticked. */
  readonly current?: readonly { readonly id: string; readonly fullName: string }[];
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly error?: string | undefined;
}) {
  const t = useTranslations('projectTeam.create');
  const sheetT = useTranslations('projectTeam.sheet');
  const gone = current.filter((member) => !people.some((person) => person.id === member.id));
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...value, id] : value.filter((item) => item !== id));
  return (
    <Field label={t('team')} hint={t('teamCount', { count: value.length })} error={error}>
      <div className="max-h-52 overflow-y-auto rounded-lg border border-hairline px-3 py-1">
        {people.length === 0 && gone.length === 0 && (
          <p className="py-2 type-body-sm text-ink-faint">{t('teamEmpty')}</p>
        )}
        {gone.map((member) => (
          <Checkbox
            key={member.id}
            checked={value.includes(member.id)}
            onCheckedChange={(on) => toggle(member.id, on)}
            label={sheetT('inactiveName', { name: member.fullName })}
          />
        ))}
        {people.map((person) => (
          <Checkbox
            key={person.id}
            checked={value.includes(person.id)}
            onCheckedChange={(on) => toggle(person.id, on)}
            label={person.fullName}
            description={person.roles.join(' · ')}
          />
        ))}
      </div>
    </Field>
  );
}
