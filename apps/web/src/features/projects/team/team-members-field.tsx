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
  value,
  onChange,
  error,
}: {
  readonly people: TeamOptions['people'];
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly error?: string | undefined;
}) {
  const t = useTranslations('projectTeam.create');
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...value, id] : value.filter((item) => item !== id));
  return (
    <Field label={t('team')} hint={t('teamCount', { count: value.length })} error={error}>
      <div className="max-h-52 overflow-y-auto rounded-lg border border-hairline px-3 py-1">
        {people.length === 0 && (
          <p className="py-2 type-body-sm text-ink-faint">{t('teamEmpty')}</p>
        )}
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
