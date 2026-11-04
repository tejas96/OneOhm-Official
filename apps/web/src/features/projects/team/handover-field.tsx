'use client';

import type { TeamOptions } from '@oneohm/api-contracts';
import { Field, Select } from '@oneohm/design-system/web';
import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type HandOverNeed, KEEP } from './handover-needs';

/** One row per removed person who still has open tasks: who takes them. */
export function HandOverField({
  needs,
  people,
  team,
  picks,
  onPick,
  error,
}: {
  readonly needs: readonly HandOverNeed[];
  readonly people: TeamOptions['people'];
  /** Ids on the new team. */
  readonly team: readonly string[];
  readonly picks: Readonly<Record<string, string>>;
  readonly onPick: (fromUserId: string, value: string) => void;
  readonly error?: string | undefined;
}) {
  const t = useTranslations('projectTeam.sheet.handOver');
  if (needs.length === 0) return null;
  const gone = new Set(needs.map((need) => need.id));
  // People staying on the team first, then other active staff.
  const staff = people.filter((person) => !gone.has(person.id));
  const ordered = [
    ...staff.filter((person) => team.includes(person.id)),
    ...staff.filter((person) => !team.includes(person.id)),
  ];
  return (
    <div className="flex flex-col gap-4">
      {needs.map((need) => (
        <Field
          key={need.id}
          label={t('has', { name: need.fullName, count: need.open })}
          hint={t('hint')}
        >
          <Select
            value={picks[need.id]}
            onValueChange={(value) => onPick(need.id, value)}
            placeholder={t('pick')}
            options={[
              ...ordered.map((person) => ({ value: person.id, label: person.fullName })),
              { value: KEEP, label: t('keep', { name: need.fullName }) },
            ]}
          />
        </Field>
      ))}
      {/* The server's hand-over error covers the whole group: shown once, under it. */}
      {error && (
        <p role="alert" className="flex items-start gap-1.5 type-body-sm text-overdue">
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
