import { Inject, Injectable } from '@nestjs/common';
import type {
  ContractorMaterial,
  CrewUsageData,
  IssueData,
  MaterialSlip,
  ProjectCustody,
  ReturnData,
  UsageData,
} from '@oneohm/api-contracts';
import { materialSlips } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { crewContractor } from '../contractors/crew-scope';
import { assertTaskOnProject, contractorOnProject, drawLines, mergeLines } from './custody-checks';
import { holdingsFor, slipList } from './custody-read';
import {
  contractorMaterial,
  projectCustody,
  quoteMaterial,
  resolveLineKey,
} from './custody-reconcile';
import { putBackInStore } from './custody-store';
import {
  addSlipLines,
  lockCustody,
  openSlip,
  productsById,
  type SlipLine,
  slipActivity,
  takeFromStore,
} from './custody-write';
import { projectMaterial } from './material-read';
import { resolveLocation, suggestFacts } from './stock-ledger';

/**
 * Material with contractors (PRD 3.10, 3.13): the store issues it for a project, the
 * crew (or the office at task completion) records what was used, and what is left
 * comes back. Issue and return move store stock; usage only lowers what the crew holds.
 * No ledger posting: material cost is booked when the vendor bill is approved.
 */
@Injectable()
export class CustodyService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  project(projectId: string): Promise<ProjectCustody> {
    return projectCustody(this.db, projectId);
  }

  contractor(contractorId: string): Promise<ContractorMaterial> {
    return contractorMaterial(this.db, contractorId);
  }

  async crewMaterial(actor: Actor): Promise<ContractorMaterial> {
    const own = await crewContractor(this.db, actor);
    return contractorMaterial(this.db, own.id);
  }

  async slip(id: string): Promise<MaterialSlip> {
    const [slip] = await slipList(this.db, eq(materialSlips.id, id), 1);
    if (!slip) throw notFound('That material slip');
    return slip;
  }

  async issue(actor: Actor, projectId: string, input: IssueData): Promise<MaterialSlip> {
    const id = await this.db.transaction(async (tx) => {
      const contractor = await contractorOnProject(tx, input.contractorId, projectId);
      await lockCustody(tx, contractor.id, projectId);
      const location = await resolveLocation(tx, input.locationId);
      const quote = await quoteMaterial(tx, projectId);
      const lines = mergeLines(input.lines);
      const product = await productsById(
        tx,
        lines.map((line) => line.productId),
      );
      const slip = await openSlip(tx, {
        kind: 'issue',
        contractorId: contractor.id,
        projectId,
        locationId: location.id,
        occurredOn: input.occurredOn,
        note: input.note,
        userId: actor.userId,
      });
      const issued: SlipLine[] = [];
      for (const line of lines) {
        const item = product(line.productId);
        const serials = await takeFromStore(tx, {
          projectId,
          locationId: location.id,
          product: item,
          quantity: line.quantity,
          slip,
          userId: actor.userId,
        });
        issued.push({ ...line, lineKey: resolveLineKey(quote, item, line.lineKey), serials });
      }
      await addSlipLines(tx, slip.id, issued);
      await suggestFacts(tx, projectId, (await projectMaterial(tx, projectId)).facts);
      await slipActivity(
        tx,
        projectId,
        `Material issued to ${contractor.name} from ${location.name} on ${slip.number}.`,
        actor.userId,
      );
      await recordAudit(tx, actor.userId, 'material.issued', 'project', projectId, {
        number: slip.number,
        contractorId: contractor.id,
        lines: issued.length,
      });
      return slip.id;
    });
    return this.slip(id);
  }

  async recordUse(actor: Actor, projectId: string, input: UsageData): Promise<MaterialSlip> {
    const id = await this.db.transaction(async (tx) => {
      const contractor = await contractorOnProject(tx, input.contractorId, projectId);
      await lockCustody(tx, contractor.id, projectId);
      await assertTaskOnProject(tx, input.taskId, projectId);
      const lines = drawLines(await holdingsFor(tx, contractor.id, projectId), input.lines, false);
      const slip = await openSlip(tx, {
        kind: 'use',
        contractorId: contractor.id,
        projectId,
        taskId: input.taskId,
        occurredOn: input.occurredOn,
        note: input.note,
        userId: actor.userId,
      });
      await addSlipLines(tx, slip.id, lines);
      await slipActivity(
        tx,
        projectId,
        `Material used by ${contractor.name} recorded on ${slip.number}.`,
        actor.userId,
      );
      await recordAudit(tx, actor.userId, 'material.used', 'project', projectId, {
        number: slip.number,
        contractorId: contractor.id,
      });
      return slip.id;
    });
    return this.slip(id);
  }

  /** The crew records its own usage, only on its own contractor's projects. */
  async crewUse(actor: Actor, input: CrewUsageData): Promise<MaterialSlip> {
    const own = await crewContractor(this.db, actor);
    const { projectId, ...rest } = input;
    return this.recordUse(actor, projectId, { ...rest, contractorId: own.id });
  }

  async recordReturn(actor: Actor, projectId: string, input: ReturnData): Promise<MaterialSlip> {
    const id = await this.db.transaction(async (tx) => {
      const contractor = await contractorOnProject(tx, input.contractorId, projectId);
      await lockCustody(tx, contractor.id, projectId);
      const location = await resolveLocation(tx, input.locationId);
      const lines = drawLines(await holdingsFor(tx, contractor.id, projectId), input.lines, true);
      const product = await productsById(
        tx,
        lines.map((line) => line.productId),
      );
      const slip = await openSlip(tx, {
        kind: 'return',
        contractorId: contractor.id,
        projectId,
        locationId: location.id,
        occurredOn: input.occurredOn,
        note: input.note,
        userId: actor.userId,
      });
      for (const line of lines) {
        await putBackInStore(tx, {
          projectId,
          locationId: location.id,
          product: product(line.productId),
          quantity: line.quantity,
          serials: line.serials,
          slip,
          userId: actor.userId,
        });
      }
      await addSlipLines(tx, slip.id, lines);
      await slipActivity(
        tx,
        projectId,
        `Unused material returned by ${contractor.name} to ${location.name} on ${slip.number}.`,
        actor.userId,
      );
      await recordAudit(tx, actor.userId, 'material.returned', 'project', projectId, {
        number: slip.number,
        contractorId: contractor.id,
      });
      return slip.id;
    });
    return this.slip(id);
  }
}
