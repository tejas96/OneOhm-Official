import { Inject, Injectable } from '@nestjs/common';
import {
  REPORT_KEYS,
  type TaskTemplateInput,
  type TaskTemplateRecord,
} from '@oneohm/api-contracts';
import {
  discomReportTemplates,
  messageTemplates,
  roles,
  skills,
  taskTemplates,
} from '@oneohm/database';
import { asc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { checkTaskTemplate } from './template-checks';

type Row = typeof taskTemplates.$inferSelect;

function present(row: Row): TaskTemplateRecord {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    description: row.description,
    stage: row.stage,
    roleKey: row.roleKey,
    skillKey: row.skillKey,
    offsetDays: row.offsetDays,
    durationDays: row.durationDays,
    dependsOn: row.dependsOn,
    conditions: (row.conditions as TaskTemplateRecord['conditions']) ?? null,
    waitingParty: row.waitingParty,
    customerVisible: row.customerVisible,
    notifyCustomer: row.notifyCustomer,
    notifyEvent: row.notifyEvent as TaskTemplateRecord['notifyEvent'],
    messageKey: row.messageKey,
    customerTitle: row.customerTitle,
    recipients: row.recipients === 'customer_and_family' ? 'customer_and_family' : 'customer',
    attachment: row.attachment,
    notifyManager: row.notifyManager,
    confirmAssignee: row.confirmAssignee,
    escalateAfterDays: row.escalateAfterDays,
    approval: row.approval,
    reviewer: row.reviewer === 'project_manager' ? 'project_manager' : 'approvers',
    evidence: row.evidence as TaskTemplateRecord['evidence'],
    captures: row.captures,
    checklist: row.checklist ?? null,
    onComplete: (row.onComplete as TaskTemplateRecord['onComplete']) ?? null,
    reports: row.reports,
    position: row.position,
    active: row.active,
  };
}

/**
 * The task library every new project is built from (PRD 3.7, 7.2). Changes apply to
 * projects created afterwards; tasks already on projects keep what they had.
 */
@Injectable()
export class TaskTemplatesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<TaskTemplateRecord[]> {
    const rows = await this.db.select().from(taskTemplates).orderBy(asc(taskTemplates.position));
    return rows.map(present);
  }

  async create(actor: Actor, input: TaskTemplateInput): Promise<TaskTemplateRecord> {
    const known = await this.known();
    if (known.keys.has(input.key))
      throw conflict('A task with this key already exists.', 'duplicate_key');
    checkTaskTemplate(input, known);
    const [last] = await this.db
      .select({ position: sql<number>`coalesce(max(${taskTemplates.position}), -1)::int` })
      .from(taskTemplates);
    const [row] = await this.db
      .insert(taskTemplates)
      .values({ ...input, position: (last?.position ?? -1) + 1 })
      .returning();
    if (!row) throw new Error('Task template insert returned nothing.');
    await recordAudit(this.db, actor.userId, 'task_template.created', 'task_template', row.id, {
      key: row.key,
    });
    return present(row);
  }

  async update(
    actor: Actor,
    id: string,
    input: Omit<TaskTemplateInput, 'key'>,
  ): Promise<TaskTemplateRecord> {
    const [current] = await this.db.select().from(taskTemplates).where(eq(taskTemplates.id, id));
    if (!current) throw notFound('That task template');
    checkTaskTemplate({ ...input, key: current.key }, await this.known());
    const [row] = await this.db
      .update(taskTemplates)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(taskTemplates.id, id))
      .returning();
    if (!row) throw notFound('That task template');
    await recordAudit(this.db, actor.userId, 'task_template.updated', 'task_template', id, {
      key: row.key,
      active: row.active,
    });
    return present(row);
  }

  /** Swaps the template with its neighbour, which is the order tasks appear in. */
  async move(id: string, direction: 'up' | 'down'): Promise<TaskTemplateRecord[]> {
    const all = await this.list();
    const index = all.findIndex((template) => template.id === id);
    if (index < 0) throw notFound('That task template');
    const other = all[direction === 'up' ? index - 1 : index + 1];
    const self = all[index];
    if (!other || !self) return all;
    await this.db.transaction(async (tx) => {
      await tx.update(taskTemplates).set({ position: -1 }).where(eq(taskTemplates.id, self.id));
      await tx
        .update(taskTemplates)
        .set({ position: self.position })
        .where(eq(taskTemplates.id, other.id));
      await tx
        .update(taskTemplates)
        .set({ position: other.position })
        .where(eq(taskTemplates.id, self.id));
    });
    return this.list();
  }

  private async known() {
    const templates = await this.db
      .select({ key: taskTemplates.key, dependsOn: taskTemplates.dependsOn })
      .from(taskTemplates);
    const roleRows = await this.db.select({ key: roles.key }).from(roles);
    const skillRows = await this.db
      .select({ key: skills.key })
      .from(skills)
      .where(eq(skills.active, true));
    const messages = await this.db
      .select({ key: messageTemplates.key, fields: messageTemplates.fields })
      .from(messageTemplates);
    const reportRows = await this.db
      .selectDistinct({ key: discomReportTemplates.key })
      .from(discomReportTemplates);
    return {
      reports: new Set([...REPORT_KEYS, ...reportRows.map((row) => row.key)]),
      keys: new Map(templates.map((row) => [row.key, row.dependsOn])),
      roles: new Set(roleRows.map((row) => row.key)),
      skills: new Set(skillRows.map((row) => row.key)),
      messages: new Map(messages.map((row) => [row.key, row.fields])),
    };
  }
}
