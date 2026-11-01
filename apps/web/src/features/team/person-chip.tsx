import { Avatar, cn } from '@oneohm/design-system/web';
import type { ReactNode } from 'react';
import { swatchOf } from './person-row';

/** A small avatar and name, with an optional line under it. */
export function PersonChip({
  person,
  detail,
  className,
}: {
  readonly person: { readonly id: string; readonly fullName: string };
  readonly detail?: ReactNode;
  readonly className?: string;
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-3', className)}>
      <Avatar name={person.fullName} swatch={swatchOf(person.id)} size="sm" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate type-body font-medium text-ink">{person.fullName}</span>
        {detail && <span className="truncate type-body-sm text-ink-faint">{detail}</span>}
      </span>
    </span>
  );
}
