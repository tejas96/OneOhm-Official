'use client';

import { Field, Input, Select } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { PEOPLE_KEY } from '@/features/team/use-team';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCan, useCurrentUser } from '@/providers/current-user';

export interface Collected {
  readonly collectedByUserId: string;
  readonly chequeNumber: string;
  readonly chequeBank: string;
  readonly chequeDate: string;
}

/**
 * Cash: who holds it until it is deposited. Cheque: its number, bank and date, so it
 * can be matched when it clears (PRD 3.11). Other methods need none of this.
 */
export function CollectedFields({
  method,
  value,
  onChange,
  errors,
}: {
  readonly method: string;
  readonly value: Collected;
  readonly onChange: (next: Collected) => void;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('projects.money.collected');
  const me = useCurrentUser();
  const canList = useCan('people.view', 'people.manage');
  // Without the right to see the team, the recorder is the only choice.
  const people = useQuery({
    queryKey: PEOPLE_KEY,
    queryFn: () => expectStatus(api.people.listPeople(), 200),
    enabled: canList,
  });
  const staff = canList
    ? (people.data ?? []).filter(
        (person) =>
          person.status === 'active' && person.roles.some((role) => role.kind === 'staff'),
      )
    : [];
  const options = staff.some((person) => person.id === me.id)
    ? staff.map((person) => ({ value: person.id, label: person.fullName }))
    : [
        { value: me.id, label: me.fullName },
        ...staff.map((p) => ({ value: p.id, label: p.fullName })),
      ];
  if (method !== 'cash' && method !== 'cheque') return null;
  const set = (patch: Partial<Collected>) => onChange({ ...value, ...patch });
  return (
    <>
      <Field
        label={t('collectedBy')}
        hint={t('collectedByHint')}
        error={errors.collectedByUserId}
        className="sm:col-span-2"
      >
        <Select
          value={value.collectedByUserId || me.id}
          onValueChange={(collectedByUserId) => set({ collectedByUserId })}
          options={options}
        />
      </Field>
      {method === 'cheque' && (
        <>
          <Field label={t('chequeNumber')} required error={errors.chequeNumber}>
            <Input
              inputMode="numeric"
              value={value.chequeNumber}
              maxLength={20}
              onChange={(event) => set({ chequeNumber: event.target.value })}
            />
          </Field>
          <Field label={t('chequeDate')} error={errors.chequeDate}>
            <Input
              type="date"
              value={value.chequeDate}
              onChange={(event) => set({ chequeDate: event.target.value })}
            />
          </Field>
          <Field label={t('chequeBank')} error={errors.chequeBank} className="sm:col-span-2">
            <Input
              value={value.chequeBank}
              maxLength={80}
              placeholder={t('chequeBankPlaceholder')}
              onChange={(event) => set({ chequeBank: event.target.value })}
            />
          </Field>
        </>
      )}
    </>
  );
}
