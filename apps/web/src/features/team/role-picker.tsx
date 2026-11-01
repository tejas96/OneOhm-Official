'use client';

import type { Role } from '@oneohm/api-contracts';
import { Checkbox, cn } from '@oneohm/design-system/web';
import { ROLE_KINDS } from '@oneohm/domain';
import { useTranslations } from 'next-intl';

/** Several roles at once, grouped by who they are for; archived roles only if already held. */
export function RolePicker({
  roles,
  value,
  onChange,
  error,
}: {
  readonly roles: readonly Role[];
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly error?: string | undefined;
}) {
  const t = useTranslations('team.form');
  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...value, id] : value.filter((entry) => entry !== id));
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="type-label font-medium text-ink">{t('roles')}</legend>
      <p className={cn('-mt-1 type-body-sm', error ? 'text-overdue' : 'text-ink-faint')}>
        {error ?? t('rolesHint')}
      </p>
      {ROLE_KINDS.map((kind) => {
        const choices = roles.filter(
          (role) => role.kind === kind && (!role.archived || value.includes(role.id)),
        );
        if (choices.length === 0) return null;
        return (
          <div key={kind} className="flex flex-col gap-1">
            <p className="type-overline text-ink-faint uppercase">{t(`kinds.${kind}`)}</p>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {choices.map((role) => (
                <Checkbox
                  key={role.id}
                  checked={value.includes(role.id)}
                  onCheckedChange={(checked) => toggle(role.id, checked)}
                  label={role.name}
                />
              ))}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
