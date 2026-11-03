'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';

/** People a lead can be given to (staff who work on leads), with their open-lead counts. */
export function useLeadOwnerOptions(enabled: boolean) {
  const t = useTranslations('leads');
  const owners = useQuery({
    queryKey: ['leads', 'owners'],
    queryFn: () => expectStatus(api.leadIntake.leadOwners(), 200),
    enabled,
    staleTime: 60_000,
  });
  return (owners.data ?? []).map((owner) => ({
    value: owner.id,
    label: owner.fullName,
    system: owner.system,
    description: owner.onLeave
      ? t('ownerOnLeave', { count: owner.openLeads })
      : t('ownerLoad', { count: owner.openLeads }),
  }));
}
