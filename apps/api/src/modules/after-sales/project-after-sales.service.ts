import { Inject, Injectable } from '@nestjs/common';
import type {
  AmcContract,
  AmcSaleInput,
  InstalledAsset,
  InstalledAssetPatch,
  ProjectAfterSales,
} from '@oneohm/api-contracts';
import { amcContracts, amcPlans, amcVisits, installedAssets, projects } from '@oneohm/database';
import { amcEndsOn, scheduleVisits, visitCount } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, gte, isNull } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { assetsOf, contractsOf, toAsset } from './after-sales.read';
import { amcSaleRefusal } from './amc-sale-check';
import { commissionedOn, recordInstalledAssets } from './installed-assets.record';

/** A project's installed system, its warranties and its AMCs (PRD 3.17). */
@Injectable()
export class ProjectAfterSalesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private async project(projectId: string) {
    const [row] = await this.db
      .select({ id: projects.id, customerId: projects.customerId, status: projects.status })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!row) throw notFound('That project');
    return row;
  }

  async read(projectId: string): Promise<ProjectAfterSales> {
    await this.project(projectId);
    const today = todayIn();
    const [assets, amcs] = await Promise.all([
      assetsOf(this.db, [projectId], today),
      contractsOf(this.db, [projectId], today),
    ]);
    return {
      commissionedOn: await commissionedOn(this.db, projectId),
      assets: assets.get(projectId) ?? [],
      amcs: amcs.get(projectId) ?? [],
    };
  }

  /** For systems commissioned before assets were recorded automatically. */
  async record(actorId: string, projectId: string): Promise<ProjectAfterSales> {
    await this.project(projectId);
    const startsOn = await commissionedOn(this.db, projectId);
    if (!startsOn) {
      throw invalid('The installed system is recorded once the project is commissioned.');
    }
    await this.db.transaction(async (tx) => {
      const saved = await recordInstalledAssets(tx, projectId, startsOn);
      await recordAudit(tx, actorId, 'assets.recorded', 'project', projectId, { saved, startsOn });
    });
    return this.read(projectId);
  }

  async updateAsset(
    actorId: string,
    id: string,
    patch: InstalledAssetPatch,
  ): Promise<InstalledAsset> {
    const [row] = await this.db
      .update(installedAssets)
      .set({
        make: patch.make?.trim() || null,
        model: patch.model,
        serialNumbers: [...new Set(patch.serialNumbers)],
        updatedAt: new Date(),
      })
      .where(eq(installedAssets.id, id))
      .returning();
    if (!row) throw notFound('That installed item');
    await recordAudit(this.db, actorId, 'assets.updated', 'installed_asset', id, patch);
    return toAsset(row, todayIn());
  }

  async sellAmc(actorId: string, projectId: string, input: AmcSaleInput): Promise<AmcContract> {
    const project = await this.project(projectId);
    const refusal = amcSaleRefusal(project.status, await commissionedOn(this.db, projectId));
    if (refusal) throw invalid(refusal);
    const [plan] = await this.db.select().from(amcPlans).where(eq(amcPlans.id, input.planId));
    if (!plan?.active) throw invalid('Pick a plan that is on sale.', { planId: 'Not on sale.' });
    const endsOn = amcEndsOn(input.startsOn, plan.durationMonths);
    const running = (await contractsOf(this.db, [projectId], todayIn())).get(projectId) ?? [];
    const overlap = running.find(
      (contract) =>
        contract.state !== 'cancelled' &&
        contract.startsOn <= endsOn &&
        contract.endsOn >= input.startsOn,
    );
    if (overlap) {
      throw conflict(
        `This project already has an AMC from ${overlap.startsOn} to ${overlap.endsOn}.`,
        'amc_overlap',
      );
    }
    const dates = scheduleVisits(input.startsOn, endsOn, visitCount(plan));
    const id = await this.db.transaction(async (tx) => {
      const [contract] = await tx
        .insert(amcContracts)
        .values({
          projectId,
          customerId: project.customerId,
          planId: plan.id,
          planName: plan.name,
          visitName: plan.visitName,
          includes: plan.includes,
          visitsPerYear: plan.visitsPerYear,
          startsOn: input.startsOn,
          endsOn,
          pricePaise: input.pricePaise,
          note: input.note?.trim() || null,
          soldByUserId: actorId,
        })
        .returning({ id: amcContracts.id });
      if (!contract) throw new Error('AMC was not saved.');
      if (dates.length > 0) {
        await tx
          .insert(amcVisits)
          .values(
            dates.map((dueOn, index) => ({ contractId: contract.id, position: index + 1, dueOn })),
          );
      }
      await recordAudit(tx, actorId, 'amc.sold', 'amc_contract', contract.id, {
        projectId,
        plan: plan.name,
        ...input,
      });
      return contract.id;
    });
    return this.contract(projectId, id);
  }

  async cancelAmc(actorId: string, id: string): Promise<AmcContract> {
    const [contract] = await this.db
      .select({ projectId: amcContracts.projectId, cancelledAt: amcContracts.cancelledAt })
      .from(amcContracts)
      .where(eq(amcContracts.id, id));
    if (!contract) throw notFound('That AMC');
    if (!contract.cancelledAt) {
      await this.db.transaction(async (tx) => {
        await tx
          .update(amcContracts)
          .set({ cancelledAt: new Date(), updatedAt: new Date() })
          .where(eq(amcContracts.id, id));
        // Visits already opened stay with the desk; the rest are dropped.
        await tx
          .delete(amcVisits)
          .where(
            and(
              eq(amcVisits.contractId, id),
              isNull(amcVisits.serviceRequestId),
              gte(amcVisits.dueOn, todayIn()),
            ),
          );
        await recordAudit(tx, actorId, 'amc.cancelled', 'amc_contract', id);
      });
    }
    return this.contract(contract.projectId, id);
  }

  private async contract(projectId: string, id: string): Promise<AmcContract> {
    const found = (await contractsOf(this.db, [projectId], todayIn()))
      .get(projectId)
      ?.find((contract) => contract.id === id);
    if (!found) throw notFound('That AMC');
    return found;
  }
}
