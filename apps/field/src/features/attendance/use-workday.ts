import type { MyWorkday } from '@oneohm/api-contracts';
import { LOCATION_CONSENT_VERSION } from '@oneohm/domain';
import { unwrap } from '@oneohm/mobile-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, keys } from '@/api/api';
import { useCan } from '@/session/session-provider';
import { readLocation } from './location';

/** The person's own attendance, leave balances and points (PRD 4.1). */
export function useWorkday() {
  const allowed = useCan('attendance.mark');
  return useQuery({
    queryKey: keys.workday,
    queryFn: () => unwrap(api.workforce.myWorkday()),
    enabled: allowed,
  });
}

/**
 * Check in or out. The location is read only when the person has agreed and the
 * policy asks for it; the result says whether it was left out and why.
 */
export function useAttendanceAction(kind: 'in' | 'out', workday: MyWorkday | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Only with consent, the policy on and inside working hours (PRD 4.3).
      const wanted =
        (workday?.tracking ?? 'on') === 'on' &&
        workday?.attendance.captureLocation &&
        workday.consent.given;
      const reading = wanted ? await readLocation() : null;
      const position = reading && reading !== 'denied' ? reading : null;
      const body = { position };
      const day = await unwrap(
        kind === 'in' ? api.workforce.checkIn({ body }) : api.workforce.checkOut({ body }),
      );
      return {
        day,
        missed: wanted ? (reading === 'denied' ? 'denied' : reading ? null : 'nofix') : null,
      };
    },
    onSuccess: ({ day }) => client.setQueryData(keys.workday, day),
  });
}

/**
 * Yes or no to the consent words, sent with their version so the record says what was
 * read. Site check-ins read the same consent, so their screens refresh too.
 */
export function useConsent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (given: boolean) =>
      unwrap(
        api.workforce.setLocationConsent({
          body: { given, version: LOCATION_CONSENT_VERSION },
        }),
      ),
    onSuccess: async (day) => {
      client.setQueryData(keys.workday, day);
      await client.invalidateQueries({ queryKey: ['site'] });
    },
  });
}
