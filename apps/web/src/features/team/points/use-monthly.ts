'use client';

import type { DecideMonthInput } from '@oneohm/api-contracts';
import { monthOf, previousMonth } from '@oneohm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { BONUSES_KEY } from '../bonuses/use-bonuses';
import { WORKFORCE_KEYS } from '../workforce-keys';

/** The last six finished months, newest first: the months that can be reviewed. */
export function reviewableMonths(now = new Date()): string[] {
  const months: string[] = [];
  let month = previousMonth(monthOf(now));
  for (let index = 0; index < 6; index += 1) {
    months.push(month);
    month = previousMonth(month);
  }
  return months;
}

const monthlyKey = (month: string) => [...WORKFORCE_KEYS.points, 'monthly', month] as const;

export function useMonthlyReview(month: string) {
  return useQuery({
    queryKey: monthlyKey(month),
    queryFn: () => expectStatus(api.rewards.monthlyReview({ query: { month } }), 200),
  });
}

export function useMonthlyPerson(userId: string | null, month: string) {
  return useQuery({
    queryKey: [...monthlyKey(month), userId],
    queryFn: () =>
      expectStatus(
        api.rewards.monthlyPerson({ params: { id: userId ?? '' }, query: { month } }),
        200,
      ),
    enabled: userId !== null,
  });
}

/** Decides a person's month; the review, standings and bonuses all refresh. */
export function useDecideMonth() {
  const client = useQueryClient();
  return useCallback(
    async (userId: string, body: DecideMonthInput) => {
      const result = await expectStatus(
        api.rewards.decideMonth({ params: { id: userId }, body }),
        200,
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: WORKFORCE_KEYS.points }),
        client.invalidateQueries({ queryKey: BONUSES_KEY }),
      ]);
      return result;
    },
    [client],
  );
}
