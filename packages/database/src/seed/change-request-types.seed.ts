import { DEFAULT_CHANGE_REQUEST_TYPES } from '@oneohm/domain';
import { eq, isNull, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';
import { changeRequests, changeRequestTypes, discoms } from '../schema';

/**
 * Gives a DISCOM OneOhm's six change requests (PRD 3.15) when it has none of its own.
 * Rows the owner changed or switched off stay as they are; nothing is overwritten.
 */
export async function ensureChangeRequestTypes(
  db: DatabaseExecutor,
  discomId: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: changeRequestTypes.id })
    .from(changeRequestTypes)
    .where(eq(changeRequestTypes.discomId, discomId))
    .limit(1);
  if (existing) return;
  await db
    .insert(changeRequestTypes)
    .values(
      DEFAULT_CHANGE_REQUEST_TYPES.map((type, position) => ({
        discomId,
        key: type.key,
        title: type.title,
        description: type.description,
        fields: type.fields.map((field) => ({ ...field })),
        documents: [...type.documents],
        steps: type.steps.map((step) => ({ ...step, captures: [...step.captures] })),
        blocks: { stages: [...type.blocks.stages], taskKeys: [...type.blocks.taskKeys] },
        updates: [...type.updates],
        position,
      })),
    )
    .onConflictDoNothing();
}

/**
 * Every DISCOM's change requests, and each earlier request linked to its DISCOM's type.
 * A request raised before the site had a DISCOM uses its project's, else the first
 * DISCOM on the list (MSEDCL, the PRD's "current" one).
 */
export async function seedChangeRequestTypes(db: DatabaseExecutor): Promise<void> {
  const rows = await db.select({ id: discoms.id }).from(discoms).orderBy(discoms.createdAt);
  for (const row of rows) await ensureChangeRequestTypes(db, row.id);
  const fallback = rows[0]?.id;
  if (!fallback) return;
  await db
    .update(changeRequests)
    .set({
      typeId: sql`(
        select t.id from ${changeRequestTypes} t
        where t.key = ${changeRequests.type}
          and t.discom_id = coalesce(
            ${changeRequests.discomId},
            (select p.discom_id from projects p where p.id = ${changeRequests.projectId}),
            ${fallback}::uuid
          )
      )`,
    })
    .where(isNull(changeRequests.typeId));
}
