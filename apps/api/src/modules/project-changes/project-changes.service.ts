import { Inject, Injectable } from '@nestjs/common';
import type {
  ProjectChange,
  ProjectChangeImpact,
  ProjectChangeInput,
  QuotationInput,
} from '@oneohm/api-contracts';
import {
  notifyHolders,
  projectActivities,
  projectChanges,
  projects,
  quotations,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { QuotationPricingService } from '../quotations/quotation-pricing.service';
import { QuotationsService } from '../quotations/quotations.service';
import { changeImpact } from './change-impact';
import { changeView, changeViews } from './change-read';
import { withdrawChange } from './change-withdraw';
import { kindsLine, signedInr, tasksLine } from './change-words';

/** A saved change's own choices, to price it again on approval. */
const asChangeInput = (input: QuotationInput, reason: string): ProjectChangeInput => ({
  targetWp: input.targetWp,
  panelProductId: input.panelProductId,
  inverterProductId: input.inverterProductId,
  batteryProductId: input.batteryProductId ?? null,
  structureType: input.structureType,
  extras: input.extras ?? [],
  reason,
});

const priceLine = (impact: ProjectChangeImpact) =>
  `Price ${formatInr(impact.price.before.totalPaise)} → ${formatInr(impact.price.after.totalPaise)} (${signedInr(impact.price.differencePaise)}).`;

/**
 * Project change requests (PRD 3.6, 3.15): raised in one step with the impact shown,
 * approved by a project manager, then confirmed by the customer through the next revision
 * of the accepted quotation (same number). Accepting it applies the change; rejecting or
 * withdrawing it leaves the project as it was.
 */
@Injectable()
export class ProjectChangesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly pricing: QuotationPricingService,
    private readonly quotes: QuotationsService,
  ) {}

  list(projectId: string): Promise<ProjectChange[]> {
    return changeViews(this.db, eq(projectChanges.projectId, projectId));
  }

  async forQuotation(quotationId: string): Promise<ProjectChange | null> {
    const [found] = await changeViews(this.db, eq(projectChanges.quotationId, quotationId));
    return found ?? null;
  }

  async preview(projectId: string, input: ProjectChangeInput): Promise<ProjectChangeImpact> {
    return (await this.impactFor(projectId, input)).impact;
  }

  async raise(actor: Actor, projectId: string, input: ProjectChangeInput): Promise<ProjectChange> {
    const [open] = await this.db
      .select({ number: projectChanges.number })
      .from(projectChanges)
      .where(
        and(
          eq(projectChanges.projectId, projectId),
          inArray(projectChanges.status, ['raised', 'approved']),
        ),
      )
      .limit(1);
    if (open)
      throw conflict(
        `Change ${open.number} is still open. Finish or withdraw it before raising another.`,
        'change_open',
      );
    const { project, impact, input: next, fromId } = await this.impactFor(projectId, input);
    const id = await this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ number: sql<number>`coalesce(max(${projectChanges.number}), 0)::int` })
        .from(projectChanges)
        .where(eq(projectChanges.projectId, projectId));
      const number = (last?.number ?? 0) + 1;
      const [row] = await tx
        .insert(projectChanges)
        .values({
          projectId,
          number,
          kinds: impact.kinds,
          reason: input.reason,
          input: next,
          impact,
          fromQuotationId: fromId,
          raisedByUserId: actor.userId,
        })
        .returning({ id: projectChanges.id });
      if (!row) throw new Error('Change insert returned nothing.');
      const message = `Change ${number} raised (${kindsLine(impact.kinds)}): ${input.reason}. ${priceLine(impact)} ${tasksLine(impact.tasks)} Waiting for a project manager.`;
      await tx
        .insert(projectActivities)
        .values({ projectId, kind: 'scope_change', message, userId: actor.userId });
      await recordAudit(tx, actor.userId, 'project.change_raised', 'project', projectId, {
        changeId: row.id,
        kinds: impact.kinds,
        differencePaise: impact.price.differencePaise,
      });
      await notifyHolders(
        tx,
        'projects.manage',
        {
          kind: 'project_change',
          title: `${project.code}: change ${number} to approve`,
          body: `${kindsLine(impact.kinds)}. ${priceLine(impact)}`,
          subject: { type: 'project', id: projectId, projectId },
          dedupeKey: `project_change_raised:${row.id}`,
        },
        actor.userId,
      );
      return row.id;
    });
    return this.view(id);
  }

  /** A project manager agrees: the next revision of the accepted quotation is drafted. */
  async approve(actor: Actor, id: string): Promise<ProjectChange> {
    const change = await this.row(id);
    if (change.status !== 'raised')
      throw conflict('Only a raised change can be approved.', 'not_raised');
    const reason = change.reason;
    const fresh = await this.impactFor(
      change.projectId,
      asChangeInput(change.input as QuotationInput, reason),
    );
    if (fresh.fromId !== change.fromQuotationId)
      throw conflict(
        'The project moved to a new price since this change was raised. Withdraw it and raise it again.',
        'change_stale',
      );
    const accepted = await this.quotes.get(fresh.fromId);
    const [latest] = await this.db
      .select({ revision: quotations.revision })
      .from(quotations)
      .where(eq(quotations.number, accepted.number))
      .orderBy(desc(quotations.revision))
      .limit(1);
    const revision = await this.quotes.create(actor, fresh.input, {
      id: accepted.id,
      number: accepted.number,
      revision: latest?.revision ?? accepted.revision,
    });
    await this.db.transaction(async (tx) => {
      await tx
        .update(projectChanges)
        .set({
          status: 'approved',
          quotationId: revision.id,
          impact: fresh.impact,
          approvedByUserId: actor.userId,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(projectChanges.id, id));
      await tx.insert(projectActivities).values({
        projectId: change.projectId,
        kind: 'scope_change',
        message: `Change ${change.number} approved. Revision ${revision.number} R${revision.revision} (${formatInr(revision.totalPaise)}) is drafted: send it to the customer for their OK.`,
        userId: actor.userId,
      });
      await recordAudit(tx, actor.userId, 'project.change_approved', 'project', change.projectId, {
        changeId: id,
        quotationId: revision.id,
      });
    });
    return this.view(id);
  }

  /** Drops an open change; a drafted or sent revision closes with it. */
  async withdraw(actor: Actor, id: string, reason: string): Promise<ProjectChange> {
    const change = await this.row(id);
    if (change.status !== 'raised' && change.status !== 'approved')
      throw conflict('This change is already closed.', 'change_closed');
    await this.db.transaction((tx) => withdrawChange(tx, actor.userId, change, reason));
    return this.view(id);
  }

  private async view(id: string): Promise<ProjectChange> {
    const found = await changeView(this.db, id);
    if (!found) throw notFound('That change');
    return found;
  }

  private async row(id: string) {
    const [row] = await this.db.select().from(projectChanges).where(eq(projectChanges.id, id));
    if (!row) throw notFound('That change');
    return row;
  }

  /** A live project with its accepted quotation, and the change's impact on it. */
  private async impactFor(projectId: string, input: ProjectChangeInput) {
    const [project] = await this.db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) throw notFound('That project');
    if (project.status !== 'active' && project.status !== 'operational')
      throw conflict('Scope changes are for live projects.', 'not_live');
    if (project.budgetStatus === 'revision_needed')
      throw conflict(
        'A survey revision is waiting for the customer. Settle it first, then change the scope.',
        'revision_waiting',
      );
    const accepted = await this.quotes.get(project.quotationId);
    const result = await changeImpact(
      this.db,
      (next) => this.pricing.priceAgainst(next, accepted.id),
      project,
      accepted,
      input,
    );
    return { ...result, project, fromId: accepted.id };
  }
}
