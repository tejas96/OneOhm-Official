import { Inject, Injectable } from '@nestjs/common';
import type { ChangeRequestTypeInput, ChangeRequestTypeSetting } from '@oneohm/api-contracts';
import {
  changeRequests,
  changeRequestTypes,
  discoms,
  ensureChangeRequestTypes,
  roles,
  taskTemplates,
} from '@oneohm/database';
import {
  CHANGE_REQUEST_TYPES,
  type ChangeRequestStep,
  checkChangeRequestType,
  keyFromTitle,
} from '@oneohm/domain';
import { and, asc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { invalid, notFound } from '../../common/http/errors';
import type { ChangeRequestTypeRow } from '../../common/read-models/change-request-type-store';
import { DATABASE, type Database } from '../../config/core.module';

/** Step keys: kept from the step it was, else made from its title, never repeated. */
function keyedSteps(steps: ChangeRequestTypeInput['steps']): ChangeRequestStep[] {
  const used = new Set<string>();
  return steps.map((step) => {
    const base = step.key ?? keyFromTitle(step.title);
    let key = base;
    for (let n = 2; used.has(key); n += 1) key = `${base}_${n}`;
    used.add(key);
    return { ...step, key, title: step.title.trim() };
  });
}

/**
 * Settings → DISCOMs → Change requests (PRD 3.15, 7.2): each DISCOM's types, built from
 * named fields, papers, steps and impact rules. Requests already open keep the steps they
 * were raised with; new requests use the change.
 */
@Injectable()
export class ChangeRequestTypesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(actor: Actor, discomId: string): Promise<ChangeRequestTypeSetting[]> {
    assertCan(actor, 'settings.manage');
    await this.discom(discomId);
    await ensureChangeRequestTypes(this.db, discomId);
    const rows = await this.db
      .select()
      .from(changeRequestTypes)
      .where(eq(changeRequestTypes.discomId, discomId))
      .orderBy(asc(changeRequestTypes.position), asc(changeRequestTypes.createdAt));
    const open = await this.db
      .select({ typeId: changeRequests.typeId, count: sql<number>`count(*)::int` })
      .from(changeRequests)
      .where(eq(changeRequests.status, 'open'))
      .groupBy(changeRequests.typeId);
    const counts = new Map(open.map((row) => [row.typeId, row.count]));
    return rows.map((row) => this.present(row, counts.get(row.id) ?? 0));
  }

  async create(
    actor: Actor,
    discomId: string,
    input: ChangeRequestTypeInput,
  ): Promise<ChangeRequestTypeSetting> {
    assertCan(actor, 'settings.manage');
    await this.discom(discomId);
    await ensureChangeRequestTypes(this.db, discomId);
    const existing = await this.db
      .select({ key: changeRequestTypes.key, position: changeRequestTypes.position })
      .from(changeRequestTypes)
      .where(eq(changeRequestTypes.discomId, discomId));
    const base = keyFromTitle(input.title);
    let key = base;
    for (let n = 2; existing.some((row) => row.key === key); n += 1) key = `${base}_${n}`;
    const config = await this.checked(key, input);
    const position = Math.max(-1, ...existing.map((row) => row.position)) + 1;
    const [row] = await this.db
      .insert(changeRequestTypes)
      .values({
        discomId,
        ...config,
        active: input.active,
        position,
        updatedByUserId: actor.userId,
      })
      .returning();
    if (!row) throw new Error('Change request type insert returned nothing.');
    await recordAudit(
      this.db,
      actor.userId,
      'change_request_type.created',
      'change_request_type',
      row.id,
      {
        discomId,
        key,
        title: row.title,
      },
    );
    return this.present(row, 0);
  }

  async update(
    actor: Actor,
    id: string,
    input: ChangeRequestTypeInput,
  ): Promise<ChangeRequestTypeSetting> {
    assertCan(actor, 'settings.manage');
    const [current] = await this.db
      .select()
      .from(changeRequestTypes)
      .where(eq(changeRequestTypes.id, id));
    if (!current) throw notFound('That change request type');
    const config = await this.checked(current.key, input);
    const [row] = await this.db
      .update(changeRequestTypes)
      .set({
        ...config,
        active: input.active,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(changeRequestTypes.id, id))
      .returning();
    if (!row) throw notFound('That change request type');
    await recordAudit(
      this.db,
      actor.userId,
      'change_request_type.changed',
      'change_request_type',
      id,
      {
        before: { title: current.title, active: current.active, steps: current.steps.length },
        after: { title: row.title, active: row.active, steps: row.steps.length },
      },
    );
    const [open] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(changeRequests)
      .where(and(eq(changeRequests.typeId, id), eq(changeRequests.status, 'open')));
    return this.present(row, open?.count ?? 0);
  }

  /** The stored shape, after the plain-language checks pass. */
  private async checked(key: string, input: ChangeRequestTypeInput) {
    const config = {
      key,
      title: input.title.trim(),
      description: input.description.trim(),
      fields: input.fields,
      documents: input.documents,
      steps: keyedSteps(input.steps),
      blocks: input.blocks,
      updates: input.updates,
    };
    const roleRows = await this.db.select({ key: roles.key }).from(roles);
    const taskRows = await this.db.select({ key: taskTemplates.key }).from(taskTemplates);
    const errors = checkChangeRequestType(config, {
      roles: new Set(roleRows.map((row) => row.key)),
      taskKeys: new Set(taskRows.map((row) => row.key)),
    });
    if (Object.keys(errors).length > 0)
      throw invalid('Some details of this change need another look.', errors);
    return config;
  }

  private async discom(id: string) {
    const [row] = await this.db.select({ id: discoms.id }).from(discoms).where(eq(discoms.id, id));
    if (!row) throw notFound('That DISCOM');
  }

  private present(row: ChangeRequestTypeRow, openRequests: number): ChangeRequestTypeSetting {
    return {
      id: row.id,
      discomId: row.discomId,
      key: row.key,
      title: row.title,
      description: row.description,
      fields: row.fields,
      documents: row.documents,
      steps: row.steps.map((step) => ({ ...step, captures: [...step.captures] })),
      blocks: { stages: [...row.blocks.stages], taskKeys: [...row.blocks.taskKeys] },
      updates: row.updates,
      active: row.active,
      openRequests,
      builtIn: (CHANGE_REQUEST_TYPES as readonly string[]).includes(row.key),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
