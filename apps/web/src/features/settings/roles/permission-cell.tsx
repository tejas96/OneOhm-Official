'use client';

import { cn } from '@oneohm/design-system/web';
import { Check, Lock } from 'lucide-react';

const BOX = 'inline-flex size-9 items-center justify-center rounded-md';

function Mark({ held }: { readonly held: boolean }) {
  return held ? (
    <Check aria-hidden className="size-4" strokeWidth={2.25} />
  ) : (
    <span aria-hidden className="size-1.5 rounded-full bg-current" />
  );
}

/**
 * One role × permission cell: a check when allowed, a quiet dot when not. The name
 * says the whole sentence ("Sales can approve discounts") and `aria-pressed` the state.
 * A protected role shows a lock, and a reader without `roles.manage` sees marks only.
 */
export function PermissionCell({
  label,
  held,
  locked,
  editable,
  pending = false,
  onToggle,
  row,
  column,
}: {
  readonly label: string;
  readonly held: boolean;
  readonly locked: boolean;
  readonly editable: boolean;
  /** Its save is still going; clicks wait until it settles. */
  readonly pending?: boolean;
  readonly onToggle: () => void;
  /** Grid position, for arrow-key moves between cells. */
  readonly row: number;
  readonly column: number;
}) {
  if (locked)
    return (
      <span role="img" aria-label={label} className={cn(BOX, 'text-ink-faint')}>
        <Lock aria-hidden className="size-3.5" />
      </span>
    );
  if (!editable)
    return (
      <span
        role="img"
        aria-label={label}
        className={cn(BOX, held ? 'text-accent' : 'text-ink-faint/45')}
      >
        <Mark held={held} />
      </span>
    );
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={held}
      data-cell={`${row}:${column}`}
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      onClick={() => {
        if (!pending) onToggle();
      }}
      className={cn(
        BOX,
        'transition-colors duration-(--duration-fast)',
        pending && 'cursor-progress opacity-60',
        held
          ? 'text-accent hover:bg-accent-soft'
          : 'text-ink-faint/45 hover:bg-sunken hover:text-ink-muted',
      )}
    >
      <Mark held={held} />
    </button>
  );
}
