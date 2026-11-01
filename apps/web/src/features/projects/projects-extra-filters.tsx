'use client';

import { X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ProjectFilters } from './project-filters';

/**
 * Filters a link from the command centre can set but the filter bar does not show
 * (manager, expected finish, completed since), each as a chip that removes itself.
 */
export function ProjectsExtraFilters({
  filters,
  managerName: named,
  onChange,
}: {
  readonly filters: ProjectFilters;
  /** The manager asked for, as the API names them; null while loading or unknown. */
  readonly managerName: string | null;
  readonly onChange: (patch: Partial<ProjectFilters>) => void;
}) {
  const t = useTranslations('projects.list.extra');
  const format = useFormatter();
  const managerName = named ?? t('someone');
  const chips = [
    filters.manager && {
      key: 'manager',
      label: t('manager', { name: managerName }),
      clear: { manager: '' },
    },
    filters.finish !== 'any' && {
      key: 'finish',
      label: t(`finish.${filters.finish}`),
      clear: { finish: 'any' as const },
    },
    filters.since && {
      key: 'since',
      label: t('since', {
        date: format.dateTime(new Date(`${filters.since}T12:00:00`), {
          day: 'numeric',
          month: 'short',
        }),
      }),
      clear: { since: '' },
    },
  ].filter((chip) => chip !== false && chip !== '');
  if (chips.length === 0) return null;
  return (
    <ul aria-label={t('label')} className="-mt-3 flex flex-wrap gap-2">
      {chips.map(
        (chip) =>
          chip && (
            <li key={chip.key}>
              <button
                type="button"
                onClick={() => onChange(chip.clear)}
                className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-raised px-3 py-1 type-body-sm text-ink hover:border-rule"
              >
                {chip.label}
                <X aria-hidden className="size-3.5 text-ink-faint" />
                <span className="sr-only">{t('remove')}</span>
              </button>
            </li>
          ),
      )}
    </ul>
  );
}
