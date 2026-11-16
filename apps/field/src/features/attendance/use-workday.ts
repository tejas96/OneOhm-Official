import type { MyWorkday } from '@oneohm/api-contracts';
import { LOCATION_CONSENT_VERSION } from '@oneohm/domain';
import { unwrap } from '@oneohm/mobile-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, keys } from '@/api/api';
import { useCan, useCurrentUser } from '@/session/session-provider';
import { tapNow } from './tap-now';

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
 * Check in or out. The location is read whenever the person has agreed and the policy
 * switch is on (A8): the cached tracking state is not consulted, the server filters by
 * hours. With no signal the tap is kept on the phone with its time and position and sent
 * later (A9); the answer says whether the location was left out and why.
 */
export function useAttendanceAction(kind: 'in' | 'out', workday: MyWorkday | undefined) {
  const client = useQueryClient();
  const user = useCurrentUser();
  return useMutation({
    mutationFn: () => tapNow(kind, workday, client, user.id),
    onSuccess: async ({ day }) => {
      if (day) client.setQueryData(keys.workday, day);
      else await client.invalidateQueries({ queryKey: keys.workday });
    },
  });
}

/** "Resume duty": takes back today's End duty (A10). */
export function useResumeDuty() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.workforce.resumeDuty({ body: {} })),
    onSuccess: (day) => client.setQueryData(keys.workday, day),
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
