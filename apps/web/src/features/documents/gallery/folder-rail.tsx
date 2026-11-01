'use client';

import { cn, Select } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { FOLDER_ICONS, type FolderChoice } from './document-kinds';
import type { FolderEntry } from './use-gallery';
import { useFolderLabel } from './use-labels';

/**
 * Folders with their counts: a quiet list beside the gallery on wide screens, a single
 * choice above it on phones. Counts follow the search and the type chip.
 */
export function FolderRail({
  value,
  onValueChange,
  folders,
}: {
  readonly value: FolderChoice;
  readonly onValueChange: (folder: FolderChoice) => void;
  readonly folders: readonly FolderEntry[];
}) {
  const t = useTranslations('documents.gallery');
  const label = useFolderLabel();
  return (
    <>
      <nav aria-label={t('folders')} className="hidden md:sticky md:top-6 md:block md:self-start">
        <ul className="flex flex-col gap-0.5">
          {folders.map(({ folder, count }) => {
            const Icon = FOLDER_ICONS[folder];
            const selected = folder === value;
            return (
              <li key={folder}>
                <button
                  type="button"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onValueChange(folder)}
                  className={cn(
                    'flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-left type-body-sm transition-colors duration-(--duration-fast)',
                    selected
                      ? 'bg-raised font-medium text-ink shadow-e1 ring-1 ring-hairline'
                      : 'text-ink-muted hover:bg-sunken hover:text-ink',
                  )}
                >
                  <Icon
                    aria-hidden
                    className={cn('size-4 shrink-0', selected ? 'text-accent' : 'text-ink-faint')}
                  />
                  <span className="min-w-0 flex-1 truncate">{label(folder)}</span>
                  <span className="font-mono text-[0.75rem] text-ink-faint tabular-nums">
                    {count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="md:hidden">
        <Select
          label={t('folder')}
          value={value}
          onValueChange={onValueChange}
          options={folders.map(({ folder, count }) => {
            const Icon = FOLDER_ICONS[folder];
            return {
              value: folder,
              label: t('folderOption', { label: label(folder), count }),
              icon: <Icon aria-hidden />,
            };
          })}
        />
      </div>
    </>
  );
}
