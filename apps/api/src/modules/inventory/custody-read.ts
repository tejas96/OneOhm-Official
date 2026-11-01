import type { CustodyHolding, CustodyProject, MaterialSlip } from '@oneohm/api-contracts';
import {
  contractors,
  type DatabaseExecutor,
  dispatches,
  materialSlipLines,
  materialSlips,
  products,
  projects,
  projectTasks,
  stockLocations,
  users,
} from '@oneohm/database';
import { custodyTotals, installationFinished, isSerialised } from '@oneohm/domain';
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';

/** Every slip line matching `where`, with the product and whose slip it is. */
export async function custodyEntries(db: DatabaseExecutor, where: SQL | undefined) {
  return db
    .select({
      contractorId: materialSlips.contractorId,
      contractorName: contractors.name,
      projectId: materialSlips.projectId,
      projectCode: projects.code,
      projectName: projects.name,
      kind: materialSlips.kind,
      line: materialSlipLines,
      product: products,
    })
    .from(materialSlipLines)
    .innerJoin(materialSlips, eq(materialSlips.id, materialSlipLines.slipId))
    .innerJoin(contractors, eq(contractors.id, materialSlips.contractorId))
    .innerJoin(projects, eq(projects.id, materialSlips.projectId))
    .innerJoin(products, eq(products.id, materialSlipLines.productId))
    .where(where)
    .orderBy(asc(materialSlips.createdAt));
}

export type CustodyEntryRow = Awaited<ReturnType<typeof custodyEntries>>[number];

const holdingKey = (row: { productId: string; lineKey: string | null }) =>
  `${row.productId}|${row.lineKey ?? ''}`;

/** Per item and quotation line: issued, used, returned and what is still out. */
export function holdingsOf(rows: readonly CustodyEntryRow[]): CustodyHolding[] {
  const groups = new Map<string, CustodyEntryRow[]>();
  for (const row of rows) {
    const key = holdingKey(row.line);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()]
    .flatMap((group) => {
      const first = group[0];
      if (!first) return [];
      const totals = custodyTotals(
        group.map((row) => ({ kind: row.kind, quantity: row.line.quantity })),
      );
      const returned = new Set(
        group.filter((row) => row.kind === 'return').flatMap((row) => row.line.serials),
      );
      const out = group
        .filter((row) => row.kind === 'issue')
        .flatMap((row) => row.line.serials)
        .filter((serial) => !returned.has(serial));
      const { product } = first;
      return [
        {
          productId: product.id,
          name: product.name,
          brand: product.brand,
          category: product.category,
          unit: product.unit,
          serialised: isSerialised(product.category),
          lineKey: first.line.lineKey,
          ...totals,
          serials: [...new Set(out)].sort(),
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Projects whose installation tasks are all done. */
export async function installedProjects(
  db: DatabaseExecutor,
  projectIds: readonly string[],
): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set();
  const tasks = await db
    .select({
      projectId: projectTasks.projectId,
      stage: projectTasks.stage,
      status: projectTasks.status,
    })
    .from(projectTasks)
    .where(inArray(projectTasks.projectId, [...projectIds]));
  return new Set(
    projectIds.filter((id) => installationFinished(tasks.filter((task) => task.projectId === id))),
  );
}

/** Holdings grouped per contractor and project, newest project first. */
export async function custodyProjects(
  db: DatabaseExecutor,
  rows: readonly CustodyEntryRow[],
): Promise<CustodyProject[]> {
  const groups = new Map<string, CustodyEntryRow[]>();
  for (const row of rows) {
    const key = `${row.contractorId}|${row.projectId}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const installed = await installedProjects(db, [...new Set(rows.map((row) => row.projectId))]);
  return [...groups.values()]
    .flatMap((group) => {
      const first = group[0];
      if (!first) return [];
      return [
        {
          contractor: { id: first.contractorId, name: first.contractorName },
          project: { id: first.projectId, code: first.projectCode, name: first.projectName },
          installed: installed.has(first.projectId),
          holdings: holdingsOf(group),
        },
      ];
    })
    .sort((a, b) => b.project.code.localeCompare(a.project.code));
}

/** Slips matching `where`, newest first, each with its lines. */
export async function slipList(
  db: DatabaseExecutor,
  where: SQL | undefined,
  limit = 100,
): Promise<MaterialSlip[]> {
  const rows = await db
    .select({
      slip: materialSlips,
      contractorName: contractors.name,
      projectCode: projects.code,
      projectName: projects.name,
      locationName: stockLocations.name,
      dispatchNumber: dispatches.number,
      taskTitle: projectTasks.title,
      recordedBy: users.fullName,
    })
    .from(materialSlips)
    .innerJoin(contractors, eq(contractors.id, materialSlips.contractorId))
    .innerJoin(projects, eq(projects.id, materialSlips.projectId))
    .leftJoin(stockLocations, eq(stockLocations.id, materialSlips.locationId))
    .leftJoin(dispatches, eq(dispatches.id, materialSlips.dispatchId))
    .leftJoin(projectTasks, eq(projectTasks.id, materialSlips.taskId))
    .leftJoin(users, eq(users.id, materialSlips.recordedByUserId))
    .where(where)
    .orderBy(desc(materialSlips.createdAt))
    .limit(limit);
  const ids = rows.map((row) => row.slip.id);
  const lines = ids.length
    ? await db
        .select({ line: materialSlipLines, name: products.name, unit: products.unit })
        .from(materialSlipLines)
        .innerJoin(products, eq(products.id, materialSlipLines.productId))
        .where(inArray(materialSlipLines.slipId, ids))
        .orderBy(asc(products.name))
    : [];
  return rows.map(({ slip, ...row }) => ({
    id: slip.id,
    number: slip.number,
    kind: slip.kind,
    contractor: { id: slip.contractorId, name: row.contractorName },
    project: { id: slip.projectId, code: row.projectCode, name: row.projectName },
    occurredOn: slip.occurredOn,
    note: slip.note,
    locationName: row.locationName,
    dispatchNumber: row.dispatchNumber,
    taskTitle: row.taskTitle,
    photoDocumentId: slip.photoDocumentId,
    recordedBy: row.recordedBy,
    createdAt: slip.createdAt.toISOString(),
    lines: lines
      .filter((entry) => entry.line.slipId === slip.id)
      .map(({ line, name, unit }) => ({
        productId: line.productId,
        name,
        unit,
        lineKey: line.lineKey,
        quantity: line.quantity,
        serials: line.serials,
      })),
  }));
}

/** What one contractor holds on one project, for checks before use or return. */
export async function holdingsFor(
  db: DatabaseExecutor,
  contractorId: string,
  projectId: string,
): Promise<CustodyHolding[]> {
  const rows = await custodyEntries(
    db,
    and(eq(materialSlips.contractorId, contractorId), eq(materialSlips.projectId, projectId)),
  );
  return holdingsOf(rows);
}
