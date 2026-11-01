import { changeRequests, type DatabaseExecutor } from '@oneohm/database';
import { CHANGE_REQUEST_DEFINITIONS, type EpcStage } from '@oneohm/domain';
import { and, eq, inArray } from 'drizzle-orm';

export interface ChangeRequestBlock {
  readonly title: string;
  readonly stages: readonly EpcStage[];
  readonly taskKeys: readonly string[];
}

/**
 * Open change requests per project and the work each holds back (PRD 3.15 project
 * impact): a consumer name change holds net-metering and subsidy tasks, and so on.
 */
export async function openChangeRequestBlocks(
  db: DatabaseExecutor,
  projectIds: readonly string[],
): Promise<Map<string, ChangeRequestBlock[]>> {
  const blocks = new Map<string, ChangeRequestBlock[]>();
  if (projectIds.length === 0) return blocks;
  const rows = await db
    .select({
      projectId: changeRequests.projectId,
      type: changeRequests.type,
      number: changeRequests.number,
    })
    .from(changeRequests)
    .where(
      and(inArray(changeRequests.projectId, [...projectIds]), eq(changeRequests.status, 'open')),
    );
  for (const row of rows) {
    if (!row.projectId) continue;
    const definition = CHANGE_REQUEST_DEFINITIONS[row.type];
    if (definition.blocks.stages.length === 0 && definition.blocks.taskKeys.length === 0) continue;
    blocks.set(row.projectId, [
      ...(blocks.get(row.projectId) ?? []),
      {
        title: `${definition.title} (${row.number})`,
        stages: definition.blocks.stages,
        taskKeys: definition.blocks.taskKeys,
      },
    ]);
  }
  return blocks;
}

/** The change requests that hold back one task; only genuinely dependent work waits. */
export function changeRequestsBlocking(
  blocks: readonly ChangeRequestBlock[] | undefined,
  task: { readonly stage: EpcStage; readonly templateKey: string },
): string[] {
  return (blocks ?? [])
    .filter(
      (block) => block.stages.includes(task.stage) || block.taskKeys.includes(task.templateKey),
    )
    .map((block) => block.title);
}
