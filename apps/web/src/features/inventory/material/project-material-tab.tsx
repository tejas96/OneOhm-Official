'use client';

import type { CustodyProject } from '@oneohm/api-contracts';
import { Skeleton } from '@oneohm/design-system/web';
import { useState } from 'react';
import { LoadError } from '@/components/query-state';
import { useCan } from '@/providers/current-user';
import { CustodyCard, type DrawMode } from './custody-card';
import { DrawSheet } from './draw-sheet';
import { IssueSheet } from './issue-sheet';
import { ProjectMaterialCard } from './project-material-card';
import { ReconciliationCard } from './reconciliation-card';
import { SlipsCard } from './slips-card';
import { useProjectCustody } from './use-custody';

/**
 * The project room's Material tab: store status (order, reserve, dispatch), material
 * with the contractor's crew (issue, use, return), and the reconciliation per line.
 */
export function ProjectMaterialTab({ projectId }: { readonly projectId: string }) {
  const canView = useCan(
    'inventory.view',
    'inventory.manage',
    'procurement.manage',
    'dispatch.manage',
    'projects.view_all',
    'contractors.manage',
  );
  const custody = useProjectCustody(canView ? projectId : null);
  const [issuing, setIssuing] = useState(false);
  const [draw, setDraw] = useState<{ group: CustodyProject; mode: DrawMode } | null>(null);
  const data = custody.data;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-5">
          <ProjectMaterialCard projectId={projectId} />
        </div>
        <div className="min-w-0 lg:col-span-7">
          {custody.isPending && canView && <Skeleton className="h-48 rounded-xl" />}
          {custody.isError && <LoadError error={custody.error} onRetry={() => custody.refetch()} />}
          {data && (
            <CustodyCard
              custody={data}
              onIssue={() => setIssuing(true)}
              onDraw={(group, mode) => setDraw({ group, mode })}
            />
          )}
        </div>
      </div>
      {data && <ReconciliationCard custody={data} />}
      {data && data.slips.length > 0 && <SlipsCard slips={data.slips} />}
      {data && <IssueSheet custody={data} open={issuing} onOpenChange={setIssuing} />}
      <DrawSheet
        group={draw?.group ?? null}
        mode={draw?.mode ?? 'use'}
        onClose={() => setDraw(null)}
      />
    </div>
  );
}
