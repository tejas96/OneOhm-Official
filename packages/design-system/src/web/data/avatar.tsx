import { cn } from '../lib/cn';

interface AvatarProps {
  readonly name: string;
  /** Picks one of the project swatches so the same person keeps the same colour. */
  readonly swatch?: number;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly className?: string;
}

const SWATCH_CLASSES = [
  'bg-swatch-0',
  'bg-swatch-1',
  'bg-swatch-2',
  'bg-swatch-3',
  'bg-swatch-4',
  'bg-swatch-5',
] as const;

function initialsOf(name: string): string {
  // Words only: "Store (test)" gives "ST", not "S(".
  const parts = name.match(/\p{L}[\p{L}\p{M}'’-]*/gu) ?? [];
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

/** Initials on a soft swatch. The name is always available to assistive technology. */
export function Avatar({ name, swatch = 0, size = 'md', className }: AvatarProps) {
  const swatchClass = SWATCH_CLASSES[Math.abs(swatch) % SWATCH_CLASSES.length];
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-on-accent',
        size === 'sm' && 'size-7 text-[0.6875rem]',
        size === 'md' && 'size-9 text-[0.8125rem]',
        size === 'lg' && 'size-12 text-base',
        swatchClass,
        className,
      )}
    >
      <span aria-hidden>{initialsOf(name)}</span>
    </span>
  );
}
