'use client';

import { SegmentedControl } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useRoles } from '@/features/team/use-team';

type Choice = 'follow' | 'on' | 'off';

/**
 * Location switched on or off for whole roles over the company switch (PRD 4.3). A
 * person's own setting (Team → edit person) wins over these; a role switched off
 * wins over one switched on.
 */
export function TrackingByRole({
  byRole,
  company,
  onChange,
}: {
  readonly byRole: Readonly<Record<string, boolean>>;
  readonly company: boolean;
  readonly onChange: (byRole: Record<string, boolean>) => void;
}) {
  const t = useTranslations('settings.workforce.location.byRole');
  const roles = useRoles();
  const staff = (roles.data ?? []).filter((role) => role.kind === 'staff' && !role.archived);
  if (staff.length === 0) return null;

  const set = (key: string, choice: Choice) => {
    const next = { ...byRole };
    if (choice === 'follow') delete next[key];
    else next[key] = choice === 'on';
    onChange(next);
  };
  const choiceOf = (key: string): Choice =>
    byRole[key] === undefined ? 'follow' : byRole[key] ? 'on' : 'off';

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-hairline px-4 py-4">
      <div className="flex flex-col gap-0.5">
        <p className="type-body font-medium text-ink">{t('title')}</p>
        <p className="type-body-sm text-ink-faint">{t('description')}</p>
      </div>
      <ul className="flex flex-col divide-y divide-hairline">
        {staff.map((role) => (
          <li
            key={role.id}
            className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="type-body-sm text-ink">{role.name}</span>
            <SegmentedControl
              size="sm"
              label={t('label', { role: role.name })}
              value={choiceOf(role.key)}
              onValueChange={(choice) => set(role.key, choice)}
              options={[
                { value: 'follow', label: company ? t('followOn') : t('followOff') },
                { value: 'on', label: t('on') },
                { value: 'off', label: t('off') },
              ]}
              className="self-start sm:self-auto"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
