import { Inject, Injectable } from '@nestjs/common';
import type { LeadConnectionInput, SiteConnection } from '@oneohm/api-contracts';
import { discoms, leads, projects, projectTasks, properties } from '@oneohm/database';
import { asksForDiscom } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, can } from '../../common/auth/actor';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { definedOnly } from '../../common/patch';
import { DATABASE, type Database } from '../../config/core.module';
import { canViewTask } from '../projects/task-access';
import { leadVisibility } from './lead-read';
import { assertConsumerNumberFree, savingSite } from './site-rules';

/**
 * The consumer number and DISCOM of a site from the field app (PRD 4.2, 4.5): on a
 * lead's site at the first visit, and on the task that verifies the electricity bill.
 */
@Injectable()
export class SiteConnectionService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async forLead(actor: Actor, leadId: string): Promise<SiteConnection> {
    return this.present(await this.leadSite(actor, leadId), null);
  }

  async updateLead(
    actor: Actor,
    leadId: string,
    input: LeadConnectionInput,
  ): Promise<SiteConnection> {
    const propertyId = await this.leadSite(actor, leadId);
    if (input.discomId) await this.assertDiscom(input.discomId);
    const patch = definedOnly({
      consumerNumber: input.consumerNumber === undefined ? undefined : input.consumerNumber || null,
      discomId: input.discomId,
    });
    // Resellers are not told whose site has it: they see only their own customers.
    await assertConsumerNumberFree(this.db, patch.consumerNumber, {
      exceptPropertyId: propertyId,
      field: 'consumerNumber',
      reveal: actor.kind === 'staff' && can(actor, 'customers.view'),
    });
    if (Object.keys(patch).length > 0) {
      await savingSite('consumerNumber', () =>
        this.db
          .update(properties)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(properties.id, propertyId)),
      );
      await recordAudit(
        this.db,
        actor.userId,
        'property.connection_updated',
        'property',
        propertyId,
        {
          leadId,
          ...patch,
        },
      );
    }
    return this.present(propertyId, null);
  }

  async forTask(actor: Actor, taskId: string): Promise<SiteConnection> {
    const task = await this.task(actor, taskId);
    return this.present(task.propertyId, task.projectDiscomId);
  }

  /** Confirmed or corrected on the electricity task: saved on the site and the project. */
  async updateTask(actor: Actor, taskId: string, discomId: string): Promise<SiteConnection> {
    const task = await this.task(actor, taskId);
    const mine = task.assigneeUserId === actor.userId;
    if (!mine && !can(actor, 'discom.manage') && !can(actor, 'projects.manage')) {
      throw forbidden('Only the person doing this task or a manager can set the DISCOM.');
    }
    if (!asksForDiscom(task)) throw invalid('This task does not record the DISCOM.');
    if (task.status === 'completed') {
      throw conflict('This task is done; the office can change the DISCOM.', 'done');
    }
    await this.assertDiscom(discomId);
    await this.db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .update(properties)
        .set({ discomId, updatedAt: now })
        .where(eq(properties.id, task.propertyId));
      await tx
        .update(projects)
        .set({ discomId, updatedAt: now })
        .where(eq(projects.id, task.projectId));
      await recordAudit(tx, actor.userId, 'project.discom_confirmed', 'project', task.projectId, {
        taskId,
        discomId,
        previousDiscomId: task.projectDiscomId,
      });
    });
    return this.present(task.propertyId, discomId);
  }

  /** The lead's site, as the actor may see the lead (a reseller: only their own). */
  private async leadSite(actor: Actor, leadId: string): Promise<string> {
    const [lead] = await this.db
      .select({ propertyId: leads.propertyId })
      .from(leads)
      .where(and(eq(leads.id, leadId), leadVisibility(actor)))
      .limit(1);
    if (!lead) throw notFound('That lead');
    if (!lead.propertyId) throw notFound('The lead’s site');
    return lead.propertyId;
  }

  private async task(actor: Actor, taskId: string) {
    const [row] = await this.db
      .select({
        assigneeUserId: projectTasks.assigneeUserId,
        status: projectTasks.status,
        captures: projectTasks.captures,
        projectId: projects.id,
        propertyId: projects.propertyId,
        projectDiscomId: projects.discomId,
      })
      .from(projectTasks)
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .where(eq(projectTasks.id, taskId))
      .limit(1);
    if (!row || !canViewTask(actor, row)) throw notFound('That task');
    return row;
  }

  private async assertDiscom(discomId: string): Promise<void> {
    const [discom] = await this.db
      .select({ active: discoms.active })
      .from(discoms)
      .where(eq(discoms.id, discomId))
      .limit(1);
    if (!discom?.active) {
      throw invalid('Pick a DISCOM from the list.', { discomId: 'Not an active DISCOM.' });
    }
  }

  /** On a task the project's DISCOM leads; the site's own copy marks it confirmed. */
  private async present(
    propertyId: string,
    projectDiscomId: string | null,
  ): Promise<SiteConnection> {
    const [site] = await this.db
      .select()
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);
    if (!site) throw notFound('That site');
    const discomId = projectDiscomId ?? site.discomId;
    return {
      propertyId: site.id,
      label: site.label,
      addressLine: site.addressLine,
      city: site.city,
      consumerNumber: site.consumerNumber,
      discomId,
      confirmed: site.discomId !== null && site.discomId === discomId,
    };
  }
}
