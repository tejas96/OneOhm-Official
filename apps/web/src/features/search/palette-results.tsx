'use client';

import { cn } from '@oneohm/design-system/web';
import { CornerDownLeft, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ResultGroup, SearchEntry } from './search-index';

export const LIST_ID = 'jump-to-results';

export function optionId(entry: SearchEntry): string {
  return `jump-to-${entry.id.replace(/[^a-zA-Z0-9-]/g, '-')}`;
}

interface PaletteResultsProps {
  readonly groups: readonly ResultGroup[];
  readonly flat: readonly SearchEntry[];
  readonly active: number;
  readonly query: string;
  readonly loading: boolean;
  readonly failed: boolean;
  /** Whether the person may search any records (else only pages). */
  readonly searchable: boolean;
  readonly onHover: (index: number) => void;
  readonly onPick: (entry: SearchEntry) => void;
}

/** The grouped listbox under the search field, with its loading, empty and error lines. */
export function PaletteResults({
  groups,
  flat,
  active,
  query,
  loading,
  failed,
  searchable,
  onHover,
  onPick,
}: PaletteResultsProps) {
  const t = useTranslations('search');
  const typed = query.trim().length > 0;

  return (
    <div
      id={LIST_ID}
      role="listbox"
      aria-label={t('results')}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
    >
      {!typed && searchable && (
        <p className="px-3 pt-1 pb-2 type-body-sm text-ink-muted">{t('startHint')}</p>
      )}
      {groups.map(({ group, entries }) => (
        <div key={group} role="presentation" className="pb-1">
          <p aria-hidden className="px-3 pt-2 pb-1 type-overline text-ink-faint uppercase">
            {t(`groups.${group}`)}
          </p>
          {entries.map((entry) => {
            const index = flat.indexOf(entry);
            return (
              <Option
                key={entry.id}
                entry={entry}
                selected={index === active}
                onHover={() => onHover(index)}
                onPick={() => onPick(entry)}
              />
            );
          })}
        </div>
      ))}
      {typed && flat.length === 0 && !loading && (
        <div className="flex flex-col gap-1 px-3 py-8 text-center">
          <p className="type-body-sm font-medium text-ink">{t('emptyTitle', { query })}</p>
          <p className="type-body-sm text-ink-muted">{t('emptyHint')}</p>
        </div>
      )}
      {typed && loading && (
        <p role="status" className="flex items-center gap-2 px-3 py-3 type-body-sm text-ink-muted">
          <LoaderCircle aria-hidden className="size-4 animate-spin text-ink-faint" />
          {t('loading')}
        </p>
      )}
      {failed && <p className="px-3 py-3 type-body-sm text-ink-muted">{t('loadError')}</p>}
    </div>
  );
}

interface OptionProps {
  readonly entry: SearchEntry;
  readonly selected: boolean;
  readonly onHover: () => void;
  readonly onPick: () => void;
}

function Option({ entry, selected, onHover, onPick }: OptionProps) {
  const Icon = entry.icon;
  return (
    <div
      id={optionId(entry)}
      role="option"
      tabIndex={-1}
      aria-selected={selected}
      onMouseMove={selected ? undefined : onHover}
      onClick={onPick}
      onKeyDown={() => undefined}
      className={cn(
        'flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-3 py-1.5',
        'transition-colors duration-(--duration-fast)',
        selected ? 'bg-sunken' : 'hover:bg-sunken/60',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-hairline bg-surface',
          selected ? 'text-accent' : 'text-ink-faint',
        )}
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate type-body-sm font-medium text-ink">{entry.title}</span>
        {entry.detail && <span className="truncate type-label text-ink-faint">{entry.detail}</span>}
      </span>
      {selected && <CornerDownLeft aria-hidden className="size-3.5 shrink-0 text-ink-faint" />}
    </div>
  );
}
