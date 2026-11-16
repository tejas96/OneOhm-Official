import { ApiError, unwrap } from '@oneohm/mobile-ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/api/api';
import { useCan, useCurrentUser } from '@/session/session-provider';

export const monthKeys = { mine: (month: string) => ['me', 'month', month] as const };

/**
 * Only staff have a month sheet; crews and resellers never see My month. Staff who neither mark
 * attendance nor ask for leave have nothing on it either.
 */
export function useHasMonth(): boolean {
  const staff = useCurrentUser().kind === 'staff';
  return useCan('attendance.mark', 'leave.request') && staff;
}

/** "Not on the sheet" is an answer, not a failure: it is never asked again. */
const retry = (count: number, error: unknown) =>
  !(error instanceof ApiError && (error.status === 404 || error.status === 403)) && count < 2;

/** The person's own month sheet (same numbers HR sees); cached a minute, never blocks Today. */
export function useMyMonth(month: string) {
  const allowed = useHasMonth();
  return useQuery({
    queryKey: monthKeys.mine(month),
    queryFn: () => unwrap(api.monthSheet.myMonth({ query: { month } })),
    enabled: allowed,
    staleTime: 60_000,
    retry,
    placeholderData: keepPreviousData,
  });
}

/** The month sheet said this person is not on it (404) or may not see it. */
export const notOnSheet = (error: unknown) =>
  error instanceof ApiError && (error.status === 404 || error.status === 403);
