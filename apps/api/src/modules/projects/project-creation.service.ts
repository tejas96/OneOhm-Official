import { Inject, Injectable } from '@nestjs/common';
import {
  customers,
  discoms,
  openManagerTerm,
  products,
  projectActivities,
  projectFacts,
  projects,
  properties,
  quotations,
} from '@oneohm/database';
import { generateTasks, type ProjectType } from '@oneohm/domain';
import { formatKwp } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { queueWhatsApp } from '../../common/outbox';
import { DATABASE, type Database } from '../../config/core.module';
import { assertVariantOffered } from '../business-settings/project-variant-check';
import { syncWorkOrders } from '../contractors/work-order-sync';
import { raiseProjectNameChange } from '../discom/change-request-raise';
import { inverterProducts, invertersOf } from '../quotations/quotation-inverters';
import { projectStarted } from '../quotations/quotation-project';
import { moveCustomerChats } from '../whatsapp/chat-owner';
import { checkProjectInput } from './project-input';
import { moveLeadPapers } from './project-lead-papers';
import { loadLoanPartner, setUpProjectLoan } from './project-loan-setup';
import { activateMilestones } from './project-milestones';
import { createdMessage, initialFacts, nextCode, writeGeneratedTasks } from './project-setup';
import { resolveProjectTeam, saveProjectTeam, type TeamChoice } from './project-team';
import { checkManagerCandidate } from './project-team-rules';
import { loadAssigneeCandidates, loadTaskLibrary } from './task-library.loader';
import { tellTeam } from './task-notices';

export interface NewProject extends TeamChoice {
  quotationId: string;
  discomId: string;
  loan: boolean;
  lenderName?: string | null | undefined;
  lendingPartnerId?: string | null | undefined;
  loanPaise: number;
  battery: boolean;
  groundMount: boolean;
  nameChange: boolean;
  managerUserId?: string | null | undefined;
  paymentPlanId?: string | null | undefined;
  startDate: string;
  targetFinishDate?: string | null | undefined;
}

const PROJECT_TYPE = {
  individual: 'residential',
  society: 'society',
  commercial: 'commercial',
} as const satisfies Record<string, ProjectType>;

export interface CreatedProject {
  id: string;
  code: string;
  tasks: number;
  unassigned: number;
  toConfirm: number;
}

/**
 * The owner confirms a handful of facts, the team and the contractor; the system builds
 * the rest: conditional tasks, assignment within that team, dependencies, payment
 * milestones and report facts (PRD 3.8, Flow A).
 */
@Injectable()
export class ProjectCreationService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private async acceptedQuotation(quotationId: string) {
    const [quotation] = await this.db
      .select()
      .from(quotations)
      .where(eq(quotations.id, quotationId))
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
    return quotation;
  }

  private async parts(quotation: typeof quotations.$inferSelect) {
    const [property] = await this.db
      .select()
      .from(properties)
      .where(eq(properties.id, quotation.propertyId));
    const [customer] = await this.db
      .select()
      .from(customers)
      .where(eq(customers.id, quotation.customerId));
    const [panel] = await this.db
      .select()
      .from(products)
      .where(eq(products.id, quotation.panelProductId));
    const inverters = await inverterProducts(this.db, await invertersOf(this.db, quotation.id));
    if (!property || !customer || !panel || inverters.length === 0) {
      throw notFound('The quotation details');
    }
    return { property, customer, panel, inverters };
  }

  async create(actor: Actor, input: NewProject): Promise<CreatedProject> {
    const quotation = await this.acceptedQuotation(input.quotationId);
    const [discom] = await this.db.select().from(discoms).where(eq(discoms.id, input.discomId));
    if (!discom) throw invalid('Choose the DISCOM.', { discomId: 'Unknown DISCOM.' });
    const managerUserId = checkProjectInput(input);
    const partner = await loadLoanPartner(this.db, input);
    const { property, customer, panel, inverters } = await this.parts(quotation);

    const type = PROJECT_TYPE[quotation.subsidyCategory];
    const battery = input.battery || quotation.batteryProductId !== null;
    const groundMount = input.groundMount || quotation.structureType === 'ground_mount';
    await assertVariantOffered(this.db, type, groundMount);
    const generated = generateTasks(
      await loadTaskLibrary(this.db),
      {
        projectType: type,
        discomCode: discom.code,
        loan: input.loan,
        battery,
        groundMount,
        subsidy: quotation.subsidyPaise > 0,
        nameChange: input.nameChange,
      },
      input.startDate,
    );
    const candidates = await loadAssigneeCandidates(this.db);
    const team = await resolveProjectTeam(this.db, input, generated, candidates, [
      property.district,
      property.city,
    ]);

    await checkManagerCandidate(this.db, managerUserId);
    return this.db.transaction(async (tx) => {
      const code = await nextCode(tx, input.startDate.slice(0, 4));
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
          lenderName: partner?.name ?? input.lenderName ?? null,
          loanPaise: input.loan ? input.loanPaise : 0,
          battery,
          groundMount,
          subsidy: quotation.subsidyPaise > 0,
          nameChange: input.nameChange,
          managerUserId,
          startDate: input.startDate,
          targetFinishDate: input.targetFinishDate ?? null,
        })
        .returning({ id: projects.id });
      if (!project) throw new Error('Project insert returned nothing.');
      await moveLeadPapers(tx, quotation.leadId, project.id, property.id, customer.id);
      await openManagerTerm(tx, project.id, managerUserId, new Date());
      // The customer's WhatsApp chat goes to the project's manager from now on.
      await moveCustomerChats(tx, customer.id, managerUserId, project.id);

      await saveProjectTeam(tx, project.id, team, actor.userId);
      const { unassigned, toConfirm, perPerson } = await writeGeneratedTasks(
        tx,
        project.id,
        generated,
        candidates,
        team.pool,
      );
      await syncWorkOrders(tx, project.id, actor.userId);
      // A name change is the DISCOM change request, linked here: one track (PRD 3.15).
      if (input.nameChange) {
        const site = { propertyId: property.id, discomId: property.discomId ?? discom.id };
        await raiseProjectNameChange(
          tx,
          actor.userId,
          { ...site, customer, projectId: project.id, projectCode: code },
          candidates,
        );
      }
      // Before the milestones, which queue the advance notice: "started" arrives first.
      await queueWhatsApp(
        tx,
        customer.phoneE164,
        'project_started',
        { customer: customer.name, project: code, capacity: formatKwp(quotation.capacityWp) },
        `project_started:${project.id}`,
      );
      await activateMilestones(
        tx,
        project.id,
        {
          totalPaise: quotation.totalPaise,
          paymentPlanId: input.paymentPlanId,
          quotationId: quotation.id,
          loanPaise: input.loan ? input.loanPaise : 0,
        },
        actor.userId,
      );
      if (partner) await setUpProjectLoan(tx, project.id, partner, actor.userId);

      const facts = initialFacts(customer, property, quotation, panel, inverters, input.startDate);
      await tx
        .insert(projectFacts)
        .values(
          Object.entries(facts).map(([key, value]) => ({ projectId: project.id, key, value })),
        );
      await tx.insert(projectActivities).values({
        projectId: project.id,
        kind: 'created',
        message: createdMessage(quotation.number, generated.length, unassigned, toConfirm),
        userId: actor.userId,
      });
      await tellTeam(tx, project.id, code, perPerson, actor.userId);
      await projectStarted(tx, quotation, actor.userId);
      await recordAudit(tx, actor.userId, 'project.created', 'project', project.id, {
        code,
        tasks: generated.length,
        contractorId: team.pool.contractor?.id ?? null,
        team: team.pool.team,
      });
      return { id: project.id, code, tasks: generated.length, unassigned, toConfirm };
    });
  }
}
