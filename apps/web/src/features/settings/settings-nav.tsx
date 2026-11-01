'use client';

import { cn, Select } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';

export interface NavGroup<T extends string> {
  readonly key: string;
  readonly items: readonly T[];
}

/**
 * Settings sections: a grouped list down the side on wide screens, one menu on phones.
 * With a dozen sections a row of tabs runs off the page; a list stays readable.
 */
export function SettingsNav<T extends string>({
  groups,
  current,
  onSelect,
  labelOf,
}: {
  readonly groups: readonly NavGroup<T>[];
  readonly current: T;
  readonly onSelect: (value: T) => void;
  readonly labelOf: (value: T) => string;
}) {
  const t = useTranslations('settings');
  return (
    <>
      <div className="lg:hidden">
        <Select<T>
          label={t('sectionLabel')}
          value={current}
          onValueChange={onSelect}
          options={groups.flatMap((group) =>
            group.items.map((value) => ({
              value,
              label: `${t(`groups.${group.key}`)} · ${labelOf(value)}`,
            })),
          )}
        />
      </div>
      <nav
        aria-label={t('sectionLabel')}
        className="sticky top-6 hidden flex-col gap-5 self-start lg:flex"
      >
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 type-overline text-ink-faint uppercase">
              {t(`groups.${group.key}`)}
            </p>
            {group.items.map((value) => (
              <button
                key={value}
                type="button"
                aria-current={value === current ? 'page' : undefined}
                onClick={() => onSelect(value)}
                className={cn(
                  'rounded-lg px-3 py-2 text-left type-body-sm transition-colors',
                  value === current
                    ? 'bg-raised font-medium text-ink shadow-e1 ring-1 ring-hairline'
                    : 'text-ink-muted hover:bg-sunken/70 hover:text-ink',
                )}
              >
                {labelOf(value)}
              </button>
            ))}
          </div>
        ))}
      </nav>
    </>
  );
}
