import { Inject, Injectable } from '@nestjs/common';
import type { SetVisit, Visit, VisitScope, VisitsOf } from '@oneohm/api-contracts';
import { homeNameOf, leads, projectTasks, users, visits } from '@oneohm/database';
import { freeSlots, isPresenceKind, isWorkingDay, OPEN_VISIT_STATUSES } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { leadVisibility } from '../crm/lead-read';
import { tellBooked } from './visit-booked';
import { freeDaysFor, takenSlots } from './visit-capacity';
import type { VisitRow } from './visit-effects';
import { openVisitFor, scopeOfRow, targetOf, taskVisitKind, type VisitTarget } from './visit-reads';
import { cancelVisit, finishVisit, saveVisit } from './visit-store';
import { tellCancelled, visitContext } from './visit-tell';

/** Staff set, move, cancel and finish visits (redesign §8, §18 actions 4, 5 and 12). */
@Injectable()
export class VisitsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  private async allowed(actor: Actor, scope: VisitScope): Promise<void> {
    if (scope.taskId) return assertCan(actor, 'projects.manage', 'tasks.assign');
    if (scope.serviceRequestId) return assertCan(actor, 'service.manage');
    assertCan(actor, 'leads.manage');
    const [lead] = await this.db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.id, scope.leadId ?? ''), leadVisibility(actor)));
    if (!lead) throw notFound('That lead');
  }

  async of(actor: Actor, scope: VisitScope): Promise<VisitsOf> {
    await this.allowed(actor, scope);
    if (scope.taskId && !(await taskVisitKind(this.db, scope.taskId)))
      return {
        kind: null,
        presence: false,
        customerMessages: false,
        visits: [],
        taskStartDate: null,
        freeDays: [],
      };
    const target = await targetOf(this.db, scope);
    const rows = await this.db
      .select()
      .from(visits)
      .where(this.where(target))
      .orderBy(desc(visits.createdAt))
      .limit(5);
    return {
      kind: target.kind,
      presence: isPresenceKind(target.kind),
      customerMessages: target.mayMessage,
      visits: await Promise.all(rows.map((row) => this.present(row, target))),
      taskStartDate: target.taskId ? await this.taskStart(target.taskId) : null,
      freeDays: isPresenceKind(target.kind)
        ? []
        : await freeDaysFor(this.db, target.crew, 9, undefined, this.env.BUSINESS_TIMEZONE),
    };
  }

  /** Confirms the customer's pick, moves the open visit, or books a day with no pick. */
  async set(actor: Actor, body: SetVisit): Promise<Visit> {
    await this.allowed(actor, body);
    const target = await targetOf(this.db, body);
    const today = todayIn(this.env.BUSINESS_TIMEZONE);
    const presence = isPresenceKind(target.kind);
    if (body.day < today)
      throw invalid('Pick today or a later day.', { day: 'This day has passed.' });
    if (!presence && !isWorkingDay(body.day))
      throw invalid('We do not visit on Sunday.', { day: 'Pick Monday to Saturday.' });
    const existing = await openVisitFor(this.db, target);
    if (!presence) await this.assertFree(target, body, existing);
    return this.db.transaction(async (tx) => {
      const { row, moved } = await saveVisit(
        tx,
        target,
        { day: body.day, slot: body.slot, status: 'confirmed', by: 'staff', userId: actor.userId },
        existing,
        new Date(),
        this.env.BUSINESS_TIMEZONE,
      );
      if (target.mayMessage) await tellBooked(tx, target, row, moved, actor.userId);
      return this.present(row, target, tx);
    });
  }

  async cancel(actor: Actor, id: string, reason: string | undefined): Promise<Visit> {
    const row = await this.open(id);
    await this.allowed(actor, scopeOfRow(row));
    const target = await targetOf(this.db, scopeOfRow(row));
    return this.db.transaction(async (tx) => {
      const done = await cancelVisit(
        tx,
        row,
        actor.userId,
        reason ?? 'Cancelled by the team',
        target.title,
      );
      if (!done) throw conflict('This visit already changed.', 'visit_changed');
      if (target.mayMessage)
        await tellCancelled(
          tx,
          await visitContext(tx, target),
          { kind: row.kind, home: target.home },
          `visit:cancel:${id}`,
        );
      return this.present(done, target, tx);
    });
  }

  async done(actor: Actor, id: string): Promise<Visit> {
    // A visit nobody ticked in time (missed) can still be marked done when it did happen.
    const row = await this.open(id, ['missed']);
    await this.allowed(actor, scopeOfRow(row));
    const target = await targetOf(this.db, scopeOfRow(row));
    return this.db.transaction(async (tx) => {
      const done = await finishVisit(tx, row, actor.userId, target.title);
      await recordAudit(tx, actor.userId, 'visit.marked_done', 'visit', id);
      return this.present(done, target, tx);
    });
  }

  private async taskStart(taskId: string): Promise<string | null> {
    const [task] = await this.db
      .select({ start: projectTasks.startDate })
      .from(projectTasks)
      .where(eq(projectTasks.id, taskId));
    return task?.start ?? null;
  }

  private async open(id: string, also: readonly string[] = []): Promise<VisitRow> {
    const [row] = await this.db.select().from(visits).where(eq(visits.id, id));
    if (!row) throw notFound('That visit');
    if (!OPEN_VISIT_STATUSES.some((status) => status === row.status) && !also.includes(row.status))
      throw conflict('This visit is already closed.', 'closed');
    return row;
  }

  /** One person cannot have two visits in one slot. */
  private async assertFree(target: VisitTarget, body: SetVisit, existing: VisitRow | null) {
    const taken = await takenSlots(
      this.db,
      target.crew,
      todayIn(this.env.BUSINESS_TIMEZONE),
      existing?.id,
    );
    if (!freeSlots(taken[body.day] ?? []).includes(body.slot))
      throw conflict(
        'The person who comes already has a visit then. Pick another time.',
        'slot_taken',
      );
  }

  private where(target: VisitTarget) {
    return target.taskId
      ? eq(visits.taskId, target.taskId)
      : target.serviceRequestId
        ? eq(visits.serviceRequestId, target.serviceRequestId)
        : and(eq(visits.leadId, target.leadId ?? ''), eq(visits.kind, 'survey'));
  }

  private async present(
    row: VisitRow,
    target: VisitTarget,
    db: Database | Parameters<Parameters<Database['transaction']>[0]>[0] = this.db,
  ): Promise<Visit> {
    const crew = row.crewUserIds.length
      ? await db
          .select({ id: users.id, name: users.fullName, phone: users.phoneE164 })
          .from(users)
          .where(inArray(users.id, row.crewUserIds))
      : [];
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      day: row.day,
      slot: row.slot,
      home: target.home || (await homeNameOf(db, row.projectId, row.propertyId)),
      taskId: row.taskId,
      leadId: row.leadId,
      serviceRequestId: row.serviceRequestId,
      crew,
      proposedBy: row.proposedBy,
      customerConfirmedAt: row.customerConfirmedAt?.toISOString() ?? null,
      customerCannotAt: row.customerCannotAt?.toISOString() ?? null,
      customerMessages: target.mayMessage,
    };
  }
}
