'use client';

import type { Person } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { PEOPLE_KEY, ROLES_KEY } from './use-team';

/**
 * What someone has open and is still owed (spec Flow 5). Under the people key, so a save
 * that refreshes the people list refreshes this too.
 */
export function useDeparture(personId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...PEOPLE_KEY, personId, 'departure'],
    queryFn: () => expectStatus(api.people.getDeparture({ params: { id: personId ?? '' } }), 200),
    enabled: enabled && personId !== null,
  });
}

/**
 * Add a past member back: active again with a fresh invite; handed-over work stays put.
 * Refreshes the team and says so; the caller runs it through its form for errors.
 */
export function useRejoin() {
  const t = useTranslations('team.pastMember');
  const toast = useToast();
  const queryClient = useQueryClient();
  return useCallback(
    async (userId: string): Promise<Person> => {
      const person = await expectStatus(api.people.rejoinPerson({ params: { id: userId } }), 200);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PEOPLE_KEY }),
        queryClient.invalidateQueries({ queryKey: ROLES_KEY }),
      ]);
      toast({ title: t('addedBack', { name: person.fullName }), tone: 'success' });
      return person;
    },
    [queryClient, t, toast],
  );
}

/** The last person a sheet showed, kept while it slides closed so it never empties mid-way. */
export function useHeldPerson(person: Person | null): Person | null {
  const [held, setHeld] = useState(person);
  if (person && person !== held) setHeld(person);
  return person ?? held;
}
