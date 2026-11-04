'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { useTranslations } from 'next-intl';

/** For a task nobody owns yet: who is proposed for it, or plainly "Unassigned". */
export function UnassignedLabel({ task }: { readonly task: ProjectTask }) {
  const t = useTranslations('projects.task');
  const proposed = task.status === 'completed' ? null : task.proposedAssignee;
  return (
    <span className="text-at-risk">
      {proposed ? t('proposed', { name: proposed.fullName }) : t('unassigned')}
    </span>
  );
}
