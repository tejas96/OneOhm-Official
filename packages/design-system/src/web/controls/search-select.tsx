'use client';

import { Check, ChevronDown, Search } from 'lucide-react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { controlSurface, useField } from './field';

export interface SearchOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
  /** A second line under the label, also searched. */
  readonly description?: string;
  /** Extra words that find this option but are not shown (SKU, brand, rating). */
  readonly keywords?: string;
}

/** How many matches the list shows at once; typing narrows the rest. */
export const SEARCH_SELECT_LIMIT = 60;

/** Lower-case words, with numbers and letters apart: "INV-5K" → ["inv", "5", "k"]. */
const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .split(/[^a-z0-9.]+/)
    .filter(Boolean);

/**
 * Options where every word typed starts a word of the label, description or keywords, in
 * any order and case. "5kw hyb" finds "Hybrid inverter 5 kW" but not "25 kW"; "5 kw" and
 * "5kw" are the same search. (Kept in step with `matchesSearch` in @oneohm/shared.)
 */
export function filterOptions<TValue extends string>(
  options: readonly SearchOption<TValue>[],
  query: string,
): SearchOption<TValue>[] {
  const typed = wordsOf(query);
  if (typed.length === 0) return [...options];
  return options.filter((option) => {
    const words = wordsOf(`${option.label} ${option.description ?? ''} ${option.keywords ?? ''}`);
    return typed.every((word) => words.some((candidate) => candidate.startsWith(word)));
  });
}

interface SearchSelectProps<TValue extends string> {
  readonly value: TValue | undefined;
  readonly onValueChange: (value: TValue) => void;
  readonly options: readonly SearchOption<TValue>[];
  readonly placeholder?: string;
  readonly searchPlaceholder?: string;
  /** Shown when nothing matches what was typed. */
  readonly emptyText?: string;
  /** Shown under a cut list: `{shown}` and `{total}` are filled in. */
  readonly moreText?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  /** Accessible name when the control is not inside a Field. */
  readonly label?: string;
}

/**
 * A select with a search box, for long lists such as a catalog of a thousand products.
 * Type to narrow, arrows to move, Enter to pick, Escape to close.
 */
export function SearchSelect<TValue extends string>({
  value,
  onValueChange,
  options,
  placeholder = 'Choose…',
  searchPlaceholder = 'Search',
  emptyText = 'Nothing matches.',
  moreText = 'Showing {shown} of {total}. Type to narrow the list.',
  disabled,
  className,
  label,
}: SearchSelectProps<TValue>) {
  const surrounding = useField();
  const field = label ? null : surrounding;
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => filterOptions(options, query), [options, query]);
  const shown = matches.slice(0, SEARCH_SELECT_LIMIT);
  const selected = options.find((option) => option.value === value);

  // Each time it opens: an empty search, with the current pick in view.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    const index = options.findIndex((option) => option.value === value);
    setActive(index >= 0 && index < SEARCH_SELECT_LIMIT ? index : 0);
  }, [open, options, value]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (option: SearchOption<TValue> | undefined) => {
    if (!option) return;
    onValueChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const last = shown.length - 1;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (current >= last ? 0 : current + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (current <= 0 ? last : current - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(last);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick(shown[active]);
    }
  };

  const optionId = (index: number) => `${listId}-${index}`;
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        type="button"
        id={field?.id}
        aria-label={label}
        aria-describedby={field?.describedBy}
        aria-invalid={field?.invalid || undefined}
        aria-haspopup="listbox"
        disabled={disabled}
        className={cn(
          controlSurface,
          'flex h-11 items-center justify-between gap-2 px-3 text-left type-body',
          className,
        )}
      >
        <span className={cn('min-w-0 truncate', !selected && 'text-ink-faint')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-faint" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(event) => {
            // Focus the search box, not the first focusable in the panel.
            event.preventDefault();
            (event.currentTarget as HTMLElement).querySelector('input')?.focus();
          }}
          className={cn(
            'oh-pop z-50 flex flex-col overflow-hidden rounded-lg border border-hairline bg-raised shadow-e3',
            'w-(--radix-popover-trigger-width) min-w-72 max-w-[calc(100vw-1.5rem)]',
            'max-h-[min(26rem,var(--radix-popover-content-available-height))]',
          )}
        >
          <div className="relative border-hairline border-b p-2">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-4.5 size-4 -translate-y-1/2 text-ink-faint"
            />
            <input
              type="search"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={shown[active] ? optionId(active) : undefined}
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              className="h-9 w-full rounded-md bg-sunken pr-2 pl-9 type-body text-ink outline-none placeholder:text-ink-faint"
            />
          </div>
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label ?? searchPlaceholder}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1"
          >
            {shown.length === 0 ? (
              <p className="px-2.5 py-3 type-body-sm text-ink-muted">{emptyText}</p>
            ) : (
              shown.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <div
                    key={option.value}
                    id={optionId(index)}
                    data-index={index}
                    role="option"
                    tabIndex={-1}
                    aria-selected={isSelected}
                    onMouseMove={() => setActive(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(option)}
                    onKeyDown={() => undefined}
                    className={cn(
                      'relative flex min-h-10 cursor-default select-none items-center rounded-sm py-2 pr-8 pl-2.5',
                      'type-body text-ink',
                      index === active && 'bg-sunken',
                    )}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{option.label}</span>
                      {option.description && (
                        <span className="truncate type-body-sm text-ink-faint">
                          {option.description}
                        </span>
                      )}
                    </span>
                    {isSelected && (
                      <Check aria-hidden className="absolute right-2.5 size-4 text-accent" />
                    )}
                  </div>
                );
              })
            )}
          </div>
          {matches.length > shown.length && (
            <p className="border-hairline border-t px-3 py-2 type-body-sm text-ink-faint">
              {moreText
                .replace('{shown}', String(shown.length))
                .replace('{total}', String(matches.length))}
            </p>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
