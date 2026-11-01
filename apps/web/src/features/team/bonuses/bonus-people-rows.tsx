'use client';

import type { Person } from '@oneohm/api-contracts';
import { Button, IconButton, Select } from '@oneohm/design-system/web';
import { splitBonus } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NumberInput } from '@/features/settings/number-input';

export interface ShareDraft {
  readonly key: number;
  readonly userId: string;
  readonly shares: number;
}

const PICK = 'pick';

/** Each person with their whole-number shares, and what that makes of the total. */
export function BonusPeopleRows({
  rows,
  onChange,
  people,
  totalPaise,
  error,
}: {
  readonly rows: readonly ShareDraft[];
  readonly onChange: (rows: ShareDraft[]) => void;
  readonly people: readonly Person[];
  readonly totalPaise: number;
  readonly error?: string | undefined;
}) {
  const t = useTranslations('team.bonuses.propose');
  const chosen = rows.filter((row) => row.userId !== '');
  const split = totalPaise > 0 ? splitBonus(totalPaise, chosen) : [];
  const amountOf = (userId: string) => split.find((share) => share.userId === userId)?.amountPaise;
  const set = (key: number, patch: Partial<ShareDraft>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const nextKey = Math.max(0, ...rows.map((row) => row.key)) + 1;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const taken = new Set(rows.filter((other) => other.key !== row.key).map((o) => o.userId));
          const options = [
            { value: PICK, label: t('pickPerson') },
            ...people
              .filter((person) => !taken.has(person.id))
              .map((person) => ({ value: person.id, label: person.fullName })),
          ];
          const amount = row.userId ? amountOf(row.userId) : undefined;
          return (
            <li
              key={row.key}
              className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-center gap-2"
            >
              <Select
                label={t('person', { number: index + 1 })}
                value={row.userId || PICK}
                onValueChange={(userId) => set(row.key, { userId: userId === PICK ? '' : userId })}
                options={options}
              />
              <NumberInput
                unit="whole"
                aria-label={t('shares')}
                value={row.shares}
                onValueChange={(shares) => set(row.key, { shares: shares ?? 0 })}
              />
              <IconButton
                label={t('remove')}
                disabled={rows.length === 1}
                onClick={() => onChange(rows.filter((other) => other.key !== row.key))}
              >
                <Trash2 aria-hidden className="size-4" />
              </IconButton>
              {amount !== undefined && (
                <p className="col-span-3 -mt-1 type-label text-ink-faint">
                  {t('gets', { amount: formatInr(amount) })}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="type-body-sm text-overdue">{error}</p>}
      <Button
        variant="quiet"
        size="sm"
        leadingIcon={<Plus />}
        className="self-start"
        onClick={() => onChange([...rows, { key: nextKey, userId: '', shares: 1 }])}
      >
        {t('addPerson')}
      </Button>
    </div>
  );
}
