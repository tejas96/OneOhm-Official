'use client';

import { useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';
import { SERVICE_KEY } from './use-service-desk';

/**
 * The field side of one request (PRD 5.5): visits, the technician's notes and their
 * photos, videos and voice notes. Under the desk's key, so any desk change refreshes it.
 */
export function useFieldWork(requestId: string) {
  return useQuery({
    queryKey: [...SERVICE_KEY, 'field-work', requestId],
    queryFn: () =>
      expectStatus(api.serviceVisits.serviceFieldWork({ params: { id: requestId } }), 200),
  });
}
