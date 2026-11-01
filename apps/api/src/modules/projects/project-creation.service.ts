import { Inject, Injectable } from '@nestjs/common';
import {
  customers,
  discoms,
  paymentMilestones,
  postMilestoneDue,
  products,
  projectActivities,
  projectFacts,
  projects,
  properties,
  quotations,
  type Transaction,
} from '@oneohm/database';
import {
  DEFAULT_MILESTONES,
  generateTasks,
  type ProjectType,
  planMilestones,
} from '@oneohm/domain';
import { formatKwp } from '@oneohm/shared';
import { eq, like, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { queueWhatsApp } from '../../common/outbox';
import { DATABASE, type Database } from '../../config/core.module';
import { initialFacts, writeGeneratedTasks } from './project-setup';
import { loadAssigneeCandidates, loadTaskLibrary } from './task-library.loader';

export interface NewProject {
  quotationId: string;
  discomId: string;
  loan: boolean;
  lenderName?: string | null | undefined;
  loanPaise: number;
  battery: boolean;
  groundMount: boolean;
  nameChange: boolean;
  managerUserId?: string | null | undefined;
  startDate: string;
}

const PROJECT_TYPE = {
  individual: 'residential',
  society: 'society',
  commercial: 'commercial',
} as const satisfies Record<string, ProjectType>;

/**
 * The owner confirms a handful of facts; the system builds the rest: conditional tasks,
 * role-based assignment, dependencies, payment milestones and report facts (PRD 3.8).
 */
@Injectable()
export class ProjectCreationService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(
    actor: Actor,
    input: NewProject,
  ): Promise<{ id: string; code: string; tasks: number; unassigned: number }> {
    const [quotation] = await this.db
      .select()
      .from(quotations)
      .where(eq(quotations.id, input.quotationId))
      .limit(1);
    if (!quotation) throw notFound('That quotation');
    if (quotation.status !== 'accepted')
      throw conflict('Only an accepted quotation can become a project.', 'not_accepted');
    const [existing] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.quotationId, quotation.id))
      .limit(1);
    if (existing)
      throw conflict(
        'A project already exists for this quotation.',
        `project_exists:${existing.id}`,
      );
    const [discom] = await this.db
      .select()
      .from(discoms)
      .where(eq(discoms.id, input.discomId))
      .limit(1);
    if (!discom) throw invalid('Choose the DISCOM.', { discomId: 'Unknown DISCOM.' });
    if (input.loan && input.loanPaise <= 0)
      throw invalid('Enter the loan amount.', { loanPaise: 'Required for a loan project.' });

    const [property] = await this.db
      .select()
      .from(properties)
      .where(eq(properties.id, quotation.propertyId))
      .limit(1);
    const [customer] = await this.db
      .select()
      .from(customers)
      .where(eq(customers.id, quotation.customerId))
      .limit(1);
    const [panel] = await this.db
      .select()
      .from(products)
      .where(eq(products.id, quotation.panelProductId))
      .limit(1);
    const [inverter] = await this.db
      .select()
      .from(products)
      .where(eq(products.id, quotation.inverterProductId))
      .limit(1);
    if (!property || !customer || !panel || !inverter) throw notFound('The quotation details');

    const type = PROJECT_TYPE[quotation.subsidyCategory];
    const library = await loadTaskLibrary(this.db);
    const generated = generateTasks(
      library,
      {
        projectType: type,
        discomCode: discom.code,
        loan: input.loan,
        battery: input.battery || quotation.batteryProductId !== null,
        groundMount: input.groundMount || quotation.structureType === 'ground_mount',
        subsidy: quotation.subsidyPaise > 0,
        nameChange: input.nameChange,
      },
      input.startDate,
    );
    const candidates = (await loadAssigneeCandidates(this.db)).map((candidate) => ({
      ...candidate,
    }));

    return this.db.transaction(async (tx) => {
      const year = input.startDate.slice(0, 4);
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(projects)
        .where(like(projects.code, `OH-${year}-%`));
      const code = `OH-${year}-${String((countRow?.count ?? 0) + 1).padStart(3, '0')}`;
      const name =
        property.label && property.label !== 'Home' ? property.label : `${customer.name}`;
      const [project] = await tx
        .insert(projects)
        .values({
          code,
          name,
          customerId: customer.id,
          propertyId: property.id,
          quotationId: quotation.id,
          type,
          discomId: discom.id,
          capacityWp: quotation.capacityWp,
          loan: input.loan,
          lenderName: input.lenderName ?? null,
          loanPaise: input.loan ? input.loanPaise : 0,
          battery: quotation.batteryProductId !== null || input.battery,
          groundMount: input.groundMount || quotation.structureType === 'ground_mount',
          subsidy: quotation.subsidyPaise > 0,
          nameChange: input.nameChange,
          managerUserId: input.managerUserId ?? actor.userId,
          startDate: input.startDate,
        })
        .returning({ id: projects.id });
      if (!project) throw new Error('Project insert returned nothing.');

      const { unassigned } = await writeGeneratedTasks(tx, project.id, generated, candidates);

      const milestones = planMilestones(
        quotation.totalPaise,
        DEFAULT_MILESTONES,
        input.loan ? input.loanPaise : 0,
      );
      const createdMilestones = await tx
        .insert(paymentMilestones)
        .values(
          milestones.map((milestone, position) => ({
            projectId: project.id,
            key: milestone.key,
            label: milestone.label,
            payer: milestone.payer,
            amountPaise: milestone.amountPaise,
            trigger: milestone.trigger,
            status:
              milestone.trigger === 'quotation_accepted' ? ('due' as const) : ('upcoming' as const),
            dueAt: milestone.trigger === 'quotation_accepted' ? new Date() : null,
            position,
          })),
        )
        .returning({ id: paymentMilestones.id, dueAt: paymentMilestones.dueAt });
      await postDueMilestones(tx, createdMilestones, actor.userId);

      const facts = initialFacts(customer, property, quotation, panel, inverter, input.startDate);
      await tx
        .insert(projectFacts)
        .values(
          Object.entries(facts).map(([key, value]) => ({ projectId: project.id, key, value })),
        );
      await tx.insert(projectActivities).values({
        projectId: project.id,
        kind: 'created',
        message: `Project created from ${quotation.number} with ${generated.length} tasks${unassigned ? `, ${unassigned} waiting for someone to be assigned` : ''}.`,
        userId: actor.userId,
      });
      await queueWhatsApp(
        tx,
        customer.phoneE164,
        'project_started',
        { customer: customer.name, project: code, capacity: formatKwp(quotation.capacityWp) },
        `project_started:${project.id}`,
      );
      await recordAudit(tx, actor.userId, 'project.created', 'project', project.id, {
        code,
        tasks: generated.length,
      });
      return { id: project.id, code, tasks: generated.length, unassigned };
    });
  }
}

/** Milestones due from day one (the advance) are booked in the ledger with the project. */
async function postDueMilestones(
  tx: Transaction,
  milestones: readonly { readonly id: string; readonly dueAt: Date | null }[],
  userId: string,
): Promise<void> {
  for (const milestone of milestones) {
    if (milestone.dueAt) await postMilestoneDue(tx, milestone.id, userId);
  }
}
