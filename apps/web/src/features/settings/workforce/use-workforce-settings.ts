'use client';

import { useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

export const WORKFORCE_SETTINGS_KEY = ['settings', 'workforce'] as const;

/** Leave, attendance and points rules with the authorised places (settings or people managers). */
export function useWorkforceSettings(enabled = true) {
  return useQuery({
    queryKey: WORKFORCE_SETTINGS_KEY,
    queryFn: () => expectStatus(api.rewards.workforceSettings(), 200),
    enabled,
  });
}
