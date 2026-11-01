import {
  changeRequestTypes,
  type DatabaseExecutor,
  ensureChangeRequestTypes,
} from '@oneohm/database';
import { type ChangeRequestTypeConfig, defaultChangeRequestType } from '@oneohm/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { notFound } from '../http/errors';

export type ChangeRequestTypeRow = typeof changeRequestTypes.$inferSelect;

/** A stored type as the rules read it. */
export function configOf(row: ChangeRequestTypeRow): ChangeRequestTypeConfig {
  return {
    key: row.key,
    title: row.title,
    description: row.description,
    fields: row.fields,
    documents: row.documents,
    steps: row.steps,
    blocks: row.blocks,
    updates: row.updates,
  };
}

/** A DISCOM's type by key, giving the DISCOM OneOhm's six first if it has none yet. */
export async function typeAt(
  db: DatabaseExecutor,
  discomId: string,
  key: string,
): Promise<ChangeRequestTypeRow> {
  await ensureChangeRequestTypes(db, discomId);
  const [row] = await db
    .select()
    .from(changeRequestTypes)
    .where(and(eq(changeRequestTypes.discomId, discomId), eq(changeRequestTypes.key, key)));
  if (!row) throw notFound('That change request type at this DISCOM');
  return row;
}

/**
 * The definition each request runs on (PRD 3.15): its DISCOM's type, so the owner's
 * changes to impact and updates apply; a request from before types were stored per
 * DISCOM falls back to OneOhm's starting definition of the same key.
 */
export async function definitionsOf(
  db: DatabaseExecutor,
  requests: readonly { readonly typeId: string | null; readonly type: string }[],
): Promise<(ChangeRequestTypeConfig | null)[]> {
  const ids = [...new Set(requests.map((request) => request.typeId).filter(Boolean))] as string[];
  const rows = ids.length
    ? await db.select().from(changeRequestTypes).where(inArray(changeRequestTypes.id, ids))
    : [];
  const byId = new Map(rows.map((row) => [row.id, configOf(row)]));
  return requests.map(
    (request) =>
      (request.typeId ? byId.get(request.typeId) : undefined) ??
      defaultChangeRequestType(request.type) ??
      null,
  );
}

/** One request's definition; a type nobody can find reads as holding nothing. */
export async function definitionOf(
  db: DatabaseExecutor,
  request: { readonly typeId: string | null; readonly type: string },
): Promise<ChangeRequestTypeConfig> {
  const [definition] = await definitionsOf(db, [request]);
  return (
    definition ?? {
      key: request.type,
      title: request.type.replace(/_/g, ' '),
      description: '',
      fields: [],
      documents: [],
      steps: [],
      blocks: { stages: [], taskKeys: [] },
      updates: [],
    }
  );
}
