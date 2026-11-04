import { Avatar, cn } from '@oneohm/design-system/web';
import type { ReactNode } from 'react';
import { LeftTag } from './left-tag';
import { swatchOf } from './person-row';

/** A small avatar and name, with an optional line under it; a `Left` tag for past members. */
export function PersonChip({
  person,
  detail,
  className,
}: {
  readonly person: {
    readonly id: string;
    readonly fullName: string;
    /** Set when they left the team (spec Flow 5: old records keep a small Left tag). */
    readonly leftOn?: string | null;
  };
  readonly detail?: ReactNode;
  readonly className?: string;
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-3', className)}>
      <Avatar name={person.fullName} swatch={swatchOf(person.id)} size="sm" />
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate type-body font-medium text-ink">{person.fullName}</span>
          {person.leftOn && <LeftTag leftOn={person.leftOn} />}
        </span>
        {detail && <span className="truncate type-body-sm text-ink-faint">{detail}</span>}
      </span>
    </span>
  );
}
