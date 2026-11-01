'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { Button } from '@oneohm/design-system/web';
import { Scaling } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCan } from '@/providers/current-user';
import { ChangeScopeSheet } from './change-scope-sheet';
import { useProjectChanges } from './use-project-changes';

/** "Change scope" on a live project (PRD 3.6): one step, with the impact shown before saving. */
export function ChangeScopeButton({ project }: { readonly project: ProjectDetail }) {
  const t = useTranslations('scopeChanges');
  const canRaise = useCan('projects.manage', 'quotations.create');
  const changes = useProjectChanges(project.id);
  const [open, setOpen] = useState(false);
  const live = project.status === 'active' || project.status === 'operational';
  if (!canRaise || !live) return null;
  const pending = changes.data?.find(
    (change) => change.status === 'raised' || change.status === 'approved',
  );
  const blockedBy = pending
    ? t('blocked.open', { number: pending.number })
    : project.budget.status === 'revision_needed'
      ? t('blocked.revision')
      : null;
  return (
    <>
      <Button variant="secondary" size="sm" leadingIcon={<Scaling />} onClick={() => setOpen(true)}>
        {t('button')}
      </Button>
      <ChangeScopeSheet
        project={project}
        open={open}
        onClose={() => setOpen(false)}
        blockedBy={blockedBy}
      />
    </>
  );
}
