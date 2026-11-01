'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { Checkbox } from '@oneohm/design-system/web';

/** The items to tick before completing; each tick is sent as a fact with the completion. */
export function ChecklistFields({
  items,
  values,
  onChange,
}: {
  readonly items: ProjectTask['checklist'];
  readonly values: Readonly<Record<string, string>>;
  readonly onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-hairline px-4 py-1">
      {items.map((item) => (
        <Checkbox
          key={item.key}
          checked={Boolean(values[item.key])}
          onCheckedChange={(on) => onChange(item.key, on ? 'yes' : '')}
          label={item.label}
          strikeWhenChecked
        />
      ))}
    </div>
  );
}
