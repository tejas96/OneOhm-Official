'use client';

import { easing, IconButton, seconds } from '@oneohm/design-system/web';
import { Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type KeyboardEvent, useMemo, useState } from 'react';
import { LIST_ID, optionId, PaletteResults } from './palette-results';
import { type SearchEntry, searchEntries } from './search-index';
import { setSearchOpen, useSearchOpen } from './search-store';
import { useSearchEntries } from './use-search-entries';
import { useSearchShortcut } from './use-search-shortcut';

/** The design system's dialog arrival: a short rise from 98%. */
const ENTER = {
  initial: { opacity: 0, scale: 0.98, y: 6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: 4 },
  transition: { duration: seconds('base'), ease: easing('outQuint') },
} as const;

/**
 * "Jump to…": the pages this person may open, and universal search over every record
 * they may see (projects, customers, leads, quotations, tasks, payments, service
 * requests, files, contractors, vendors). Opens from the sidebar, the phone bar and
 * menu, and with ⌘K / Ctrl+K anywhere. Mount once.
 */
export function CommandPalette() {
  const open = useSearchOpen();
  useSearchShortcut();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setSearchOpen}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-scrim backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: seconds('fast') }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                {...ENTER}
                className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-50 mx-auto flex max-h-[min(78dvh,36rem)] max-w-xl flex-col overflow-hidden rounded-xl border border-hairline bg-raised shadow-e4 sm:top-[12dvh] sm:max-h-[min(70dvh,36rem)]"
              >
                <PaletteBody />
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

/** Mounted only while open; records are searched on the server as the person types. */
function PaletteBody() {
  const t = useTranslations('search');
  const router = useRouter();
  const [query, setQuery] = useState('');
  // The highlight follows an entry, not a position, so it stays put as lists arrive.
  const [activeId, setActiveId] = useState<string | null>(null);
  const source = useSearchEntries(query);
  const groups = useMemo(
    () => searchEntries(source.pages, source.records, query),
    [source.pages, source.records, query],
  );
  const flat = useMemo(() => groups.flatMap((group) => group.entries), [groups]);
  const current = Math.max(
    flat.findIndex((entry) => entry.id === activeId),
    0,
  );
  const highlighted = flat[current];
  const highlight = (index: number) => setActiveId(flat[index]?.id ?? null);

  const pick = (entry: SearchEntry) => {
    setSearchOpen(false);
    router.push(entry.href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (flat.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = (current + step + flat.length) % flat.length;
      highlight(next);
      // Keep the highlighted row in view as the arrow keys move it.
      const entry = flat[next];
      if (entry) document.getElementById(optionId(entry))?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && highlighted) {
      event.preventDefault();
      pick(highlighted);
    }
  };

  return (
    <>
      <DialogPrimitive.Title className="sr-only">{t('title')}</DialogPrimitive.Title>
      <div className="flex shrink-0 items-center gap-3 border-b border-hairline pr-2 pl-4">
        <Search aria-hidden className="size-[1.125rem] shrink-0 text-ink-faint" />
        <input
          role="combobox"
          type="text"
          aria-expanded
          aria-autocomplete="list"
          aria-controls={LIST_ID}
          aria-activedescendant={highlighted ? optionId(highlighted) : undefined}
          aria-label={t('label')}
          placeholder={t('placeholder')}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveId(null);
          }}
          onKeyDown={onKeyDown}
          className="h-14 min-w-0 flex-1 bg-transparent type-body text-ink outline-none placeholder:text-ink-faint pointer-coarse:text-base"
        />
        <DialogPrimitive.Close asChild>
          <IconButton label={t('close')} size="sm" className="sm:hidden">
            <X aria-hidden />
          </IconButton>
        </DialogPrimitive.Close>
      </div>
      <PaletteResults
        groups={groups}
        flat={flat}
        active={current}
        query={query}
        loading={source.loading}
        failed={source.failed}
        searchable={source.searchable}
        onHover={highlight}
        onPick={pick}
      />
      <KeyHints />
    </>
  );
}

/** Keyboard reminders for wide screens; phones tap. */
function KeyHints() {
  const t = useTranslations('search.keys');
  const kbd = 'rounded-sm border border-hairline bg-surface px-1.5 font-mono text-[0.6875rem]';
  return (
    <div
      aria-hidden
      className="hidden shrink-0 items-center gap-4 border-t border-hairline bg-surface px-4 py-2 type-label text-ink-faint sm:flex"
    >
      <span className="flex items-center gap-1.5">
        <kbd className={kbd}>↑</kbd>
        <kbd className={kbd}>↓</kbd>
        {t('move')}
      </span>
      <span className="flex items-center gap-1.5">
        <kbd className={kbd}>↵</kbd>
        {t('open')}
      </span>
      <span className="flex items-center gap-1.5">
        <kbd className={kbd}>{t('escKey')}</kbd>
        {t('close')}
      </span>
    </div>
  );
}
