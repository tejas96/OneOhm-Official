'use client';

import { cn, Tooltip } from '@oneohm/design-system/web';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { openSearch } from '@/features/search/search-store';
import { useAppleKeyboard } from '@/features/search/use-search-shortcut';

interface SearchButtonProps {
  /** Runs before the palette opens, e.g. to close the phone menu. */
  readonly onOpen?: () => void;
  /** Phones have no ⌘K; the hint only shows where a keyboard is likely. */
  readonly showShortcut?: boolean;
  /** Just the magnifier, for the collapsed sidebar. */
  readonly compact?: boolean;
  readonly className?: string;
}

/** The "Jump to…" field-like button that opens universal search. */
export function SearchButton({
  onOpen,
  showShortcut = true,
  compact = false,
  className,
}: SearchButtonProps) {
  const t = useTranslations('nav');
  const tSearch = useTranslations('search');
  const apple = useAppleKeyboard();
  return (
    <Tooltip content={t('search')} side="right" enabled={compact}>
      <button
        type="button"
        aria-haspopup="dialog"
        {...(compact ? { 'aria-label': t('search') } : {})}
        onClick={() => {
          onOpen?.();
          openSearch();
        }}
        className={cn(
          'flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 type-body-sm transition-colors',
          'border-hairline bg-raised/70 text-ink-faint shadow-e1 hover:border-rule hover:text-ink-muted dark:bg-surface',
          compact && 'justify-center px-0',
          className,
        )}
      >
        <Search aria-hidden className="size-4 shrink-0" />
        {!compact && <span className="flex-1 text-left">{t('search')}</span>}
        {showShortcut && !compact && (
          <kbd className="rounded-sm border border-current/20 px-1.5 font-mono text-[0.6875rem]">
            {tSearch(apple ? 'shortcutApple' : 'shortcutOther')}
          </kbd>
        )}
      </button>
    </Tooltip>
  );
}
