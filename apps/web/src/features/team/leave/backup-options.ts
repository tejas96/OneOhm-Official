'use client';

import type { LeaveImpact, LeaveRequestRecord } from '@oneohm/api-contracts';
import { useTranslations } from 'next-intl';
import { usePeople } from '../use-team';

export const NONE = 'none';

/**
 * Suggested backups first, then anyone else active on the staff; never the person away.
 * Someone who cannot load the people list still gets the suggested ones.
 */
export function useBackupOptions(
  leave: Pick<LeaveRequestRecord, 'user'> | null,
  impact: LeaveImpact | undefined,
) {
  const t = useTranslations('team.leave.approveDialog');
  const people = usePeople();
  const suggested = impact?.backups ?? [];
  const others = (people.data ?? []).filter(
    (person) =>
      person.status === 'active' &&
      person.id !== leave?.user.id &&
      person.roles.some((role) => role.kind === 'staff') &&
      !suggested.some((backup) => backup.id === person.id),
  );
  return [
    { value: NONE, label: t('noOne') },
    ...suggested.map((backup) => ({
      value: backup.id,
      label: backup.fullName,
      description: t('suggested', { count: backup.openTasks }),
    })),
    ...others.map((person) => ({
      value: person.id,
      label: person.fullName,
      description: t('openTasks', { count: person.openTasks }),
    })),
  ];
}
