'use client';

import { motion } from 'motion/react';
import { RadioGroup } from 'radix-ui';
import { type ReactNode, useId } from 'react';
import { cn } from '../lib/cn';
import { snappySpring } from '../motion/presets';

export interface SegmentOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
  readonly icon?: ReactNode;
  /** Hide the text on narrow screens (the icon stays, the label stays for screen readers). */
  readonly compactLabel?: boolean;
}

interface SegmentedControlProps<TValue extends string> {
  readonly value: TValue;
  readonly onValueChange: (value: TValue) => void;
  readonly options: readonly SegmentOption<TValue>[];
  readonly label: string;
  readonly size?: 'sm' | 'md';
  readonly className?: string;
}

/** Scrolls only the row (never the page) so the chosen option is fully visible. */
function keepInRow(node: HTMLElement | null) {
  const row = node?.parentElement;
  if (!node || !row) return;
  const left = node.offsetLeft;
  const right = left + node.offsetWidth;
  if (left < row.scrollLeft) row.scrollLeft = left;
  else if (right > row.scrollLeft + row.clientWidth) row.scrollLeft = right - row.clientWidth;
}

/** A small set of mutually exclusive views; the thumb slides to the choice. */
export function SegmentedControl<TValue extends string>({
  value,
  onValueChange,
  options,
  label,
  size = 'md',
  className,
}: SegmentedControlProps<TValue>) {
  const thumbId = useId();
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option) onValueChange(option.value);
      }}
      orientation="horizontal"
      // Options never wrap; when they do not fit, the row scrolls sideways (no scrollbar).
      className={cn(
        'inline-flex max-w-full overflow-x-auto overscroll-x-contain rounded-md border border-hairline bg-sunken p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            // The chosen option is kept in view when the row has to scroll.
            ref={selected ? keepInRow : undefined}
            // Named explicitly: the sliding thumb shares the item's content, and some
            // assistive tools do not compute a radio's name from its text.
            aria-label={option.label}
            className={cn(
              'relative flex shrink-0 items-center justify-center gap-1.5 rounded-[6px] px-3 font-medium whitespace-nowrap transition-colors',
              size === 'sm' ? 'h-8 text-[0.8125rem] pointer-coarse:h-10' : 'h-10 text-[0.875rem]',
              selected ? 'text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            {selected && (
              <motion.span
                layoutId={thumbId}
                transition={snappySpring}
                className="absolute inset-0 rounded-[6px] border border-hairline bg-raised shadow-e1"
              />
            )}
            {option.icon && <span className="relative [&_svg]:size-4">{option.icon}</span>}
            <span className={cn('relative', option.compactLabel && 'max-sm:sr-only')}>
              {option.label}
            </span>
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}
