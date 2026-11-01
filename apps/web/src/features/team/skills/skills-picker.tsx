'use client';

import { Checkbox } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useSkills } from './use-skills';

/** Tick the skills a person holds; assignment prefers them for tasks that need one. */
export function SkillsPicker({
  value,
  onChange,
  error,
}: {
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly error?: string | undefined;
}) {
  const t = useTranslations('team.skills');
  const query = useSkills();
  // A switched-off skill a person still holds stays visible so it can be removed.
  const shown = (query.data ?? []).filter((skill) => skill.active || value.includes(skill.key));
  const toggle = (key: string, on: boolean) =>
    onChange(on ? [...value, key] : value.filter((held) => held !== key));
  if (query.isPending) return <p className="type-body-sm text-ink-faint">{t('loading')}</p>;
  if (shown.length === 0) return <p className="type-body-sm text-ink-faint">{t('none')}</p>;
  return (
    <div className="flex flex-col gap-1">
      <div className="grid gap-x-6 sm:grid-cols-2">
        {shown.map((skill) => (
          <Checkbox
            key={skill.key}
            checked={value.includes(skill.key)}
            onCheckedChange={(on) => toggle(skill.key, on)}
            label={skill.name}
            description={skill.description || undefined}
          />
        ))}
      </div>
      {error && <p className="type-body-sm text-overdue">{error}</p>}
    </div>
  );
}
