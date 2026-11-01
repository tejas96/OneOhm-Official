import type { CustomerPendingChange } from '@oneohm/api-contracts';
import { type DatabaseExecutor, projectChanges, quotations } from '@oneohm/database';
import type { ProjectChangeKind } from '@oneohm/domain';
import { and, eq, inArray } from 'drizzle-orm';

/**
 * Changes sent to the customer for their OK, by project (PRD 3.15): the customer app shows
 * what changes and the price difference, read only; the team records the answer.
 */
export async function pendingChangesFor(
  db: DatabaseExecutor,
  projectIds: readonly string[],
): Promise<Map<string, CustomerPendingChange>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({
      projectId: projectChanges.projectId,
      number: projectChanges.number,
      kinds: projectChanges.kinds,
      from: projectChanges.fromQuotationId,
      quotationNumber: quotations.number,
      revision: quotations.revision,
      totalPaise: quotations.totalPaise,
      effectivePaise: quotations.effectivePaise,
    })
    .from(projectChanges)
    .innerJoin(quotations, eq(quotations.id, projectChanges.quotationId))
    .where(
      and(
        inArray(projectChanges.projectId, [...projectIds]),
        eq(projectChanges.status, 'approved'),
        eq(quotations.status, 'sent'),
      ),
    );
  const accepted = rows.length
    ? await db
        .select({ id: quotations.id, totalPaise: quotations.totalPaise })
        .from(quotations)
        .where(
          inArray(
            quotations.id,
            rows.map((row) => row.from),
          ),
        )
    : [];
  return new Map(
    rows.map((row) => [
      row.projectId,
      {
        number: row.number,
        kinds: row.kinds as ProjectChangeKind[],
        quotationNumber: row.quotationNumber,
        revision: row.revision,
        newTotalPaise: row.totalPaise,
        differencePaise:
          row.totalPaise - (accepted.find((quote) => quote.id === row.from)?.totalPaise ?? 0),
        newEffectivePaise: row.effectivePaise,
      },
    ]),
  );
}
