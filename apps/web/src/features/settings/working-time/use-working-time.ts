'use client';

import { useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

export const WORKING_TIME_KEY = ['settings', 'working-time'] as const;
export const VISIT_SETTINGS_KEY = ['settings', 'visits'] as const;

/** The saved working days, hours, lunch and holidays (the one business calendar). */
export function useWorkingTime() {
  return useQuery({
    queryKey: WORKING_TIME_KEY,
    queryFn: () => expectStatus(api.businessSettings.workingTime(), 200),
  });
}

/** The saved visit settings; the working-time form checks its hours against them. */
export function useVisitSettings() {
  return useQuery({
    queryKey: VISIT_SETTINGS_KEY,
    queryFn: () => expectStatus(api.businessSettings.visitSettings(), 200),
  });
}
