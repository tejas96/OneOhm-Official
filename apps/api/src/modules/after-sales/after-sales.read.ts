import type { AmcContract, InstalledAsset } from '@oneohm/api-contracts';
import {
  amcContracts,
  amcVisits,
  type DatabaseExecutor,
  installedAssets,
  serviceRequests,
  users,
} from '@oneohm/database';
import { ASSET_KINDS, type AssetKind, amcState, warrantyState } from '@oneohm/domain';
import { asc, desc, eq, inArray } from 'drizzle-orm';

type AssetRow = typeof installedAssets.$inferSelect;
type RequestStatus = 'open' | 'in_progress' | 'resolved';

const kindOrder = (kind: string) => ASSET_KINDS.indexOf(kind as AssetKind);

export function toAsset(row: AssetRow, today: string): InstalledAsset {
  return {
    id: row.id,
    kind: row.kind as AssetKind,
    make: row.make,
    model: row.model,
    quantity: row.quantity,
    serialNumbers: row.serialNumbers,
    warrantyStartsOn: row.warrantyStartsOn,
    warrantyEndsOn: row.warrantyEndsOn,
    performanceEndsOn: row.performanceEndsOn,
    warrantyState: warrantyState(row.warrantyEndsOn, today),
  };
}

/** Installed items per project, panels first. */
export async function assetsOf(
  db: DatabaseExecutor,
  projectIds: readonly string[],
  today: string,
): Promise<Map<string, InstalledAsset[]>> {
  const byProject = new Map<string, InstalledAsset[]>();
  if (projectIds.length === 0) return byProject;
  const rows = await db
    .select()
    .from(installedAssets)
    .where(inArray(installedAssets.projectId, [...projectIds]));
  rows.sort((left, right) => kindOrder(left.kind) - kindOrder(right.kind));
  for (const row of rows) {
    byProject.set(row.projectId, [...(byProject.get(row.projectId) ?? []), toAsset(row, today)]);
  }
  return byProject;
}

/** AMC contracts per project, newest first, each with its planned visits. */
export async function contractsOf(
  db: DatabaseExecutor,
  projectIds: readonly string[],
  today: string,
): Promise<Map<string, AmcContract[]>> {
  const byProject = new Map<string, AmcContract[]>();
  if (projectIds.length === 0) return byProject;
  const contracts = await db
    .select({ contract: amcContracts, soldBy: users.fullName })
    .from(amcContracts)
    .leftJoin(users, eq(users.id, amcContracts.soldByUserId))
    .where(inArray(amcContracts.projectId, [...projectIds]))
    .orderBy(desc(amcContracts.startsOn), desc(amcContracts.createdAt));
  const visits =
    contracts.length === 0
      ? []
      : await db
          .select({ visit: amcVisits, status: serviceRequests.status })
          .from(amcVisits)
          .leftJoin(serviceRequests, eq(serviceRequests.id, amcVisits.serviceRequestId))
          .where(
            inArray(
              amcVisits.contractId,
              contracts.map(({ contract }) => contract.id),
            ),
          )
          .orderBy(asc(amcVisits.position));
  for (const { contract, soldBy } of contracts) {
    const item: AmcContract = {
      id: contract.id,
      planName: contract.planName,
      visitName: contract.visitName,
      includes: contract.includes,
      startsOn: contract.startsOn,
      endsOn: contract.endsOn,
      pricePaise: contract.pricePaise,
      note: contract.note,
      state: amcState({ ...contract, cancelled: contract.cancelledAt !== null }, today),
      soldBy,
      createdAt: contract.createdAt.toISOString(),
      visits: visits
        .filter(({ visit }) => visit.contractId === contract.id)
        .map(({ visit, status }) => ({
          id: visit.id,
          position: visit.position,
          dueOn: visit.dueOn,
          request:
            visit.serviceRequestId && status
              ? { id: visit.serviceRequestId, status: status as RequestStatus }
              : null,
        })),
    };
    byProject.set(contract.projectId, [...(byProject.get(contract.projectId) ?? []), item]);
  }
  return byProject;
}
