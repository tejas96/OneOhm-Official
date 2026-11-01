import type {
  QuotationCosting,
  QuotationDetail,
  QuotationPreview,
  QuotationTotals,
} from '@oneohm/api-contracts';
import { type DatabaseExecutor, leads, quotations } from '@oneohm/database';
import { and, eq, or, type SQL, sql } from 'drizzle-orm';
import { type Actor, can } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';

/**
 * Resellers and others who may only make quotations see the ones they made or that
 * belong to their own leads (PRD 4.8). Staff with `quotations.view` see them all.
 */
export function quotationScope(actor: Actor): SQL | undefined {
  if (can(actor, 'quotations.view')) return undefined;
  return or(
    eq(quotations.createdByUserId, actor.userId),
    sql`exists (select 1 from ${leads} where ${leads.id} = ${quotations.leadId} and (${leads.resellerUserId} = ${actor.userId} or ${leads.ownerUserId} = ${actor.userId}))`,
  );
}

/** Refuses (as "not found") a quotation outside the actor's scope. */
export async function assertQuotationAccess(
  db: DatabaseExecutor,
  actor: Actor,
  id: string,
): Promise<void> {
  const scope = quotationScope(actor);
  if (!scope) return;
  const [row] = await db
    .select({ id: quotations.id })
    .from(quotations)
    .where(and(eq(quotations.id, id), scope))
    .limit(1);
  if (!row) throw notFound('That quotation');
}

/** Cost and margin are for discount approvers only (PRD 3.9, 4.8); others get zeros. */
const seesCost = (actor: Actor) => can(actor, 'quotations.approve_discount');

const hideTotals = (totals: QuotationTotals): QuotationTotals => ({
  ...totals,
  costPaise: 0,
  marginPaise: 0,
});

/** The detail stays (people may edit it); the cost build-up goes. */
const withoutBuild = ({ build: _build, ...costing }: QuotationCosting): QuotationCosting => costing;

export function previewFor(actor: Actor, preview: QuotationPreview): QuotationPreview {
  if (seesCost(actor)) return preview;
  return {
    ...preview,
    totals: hideTotals(preview.totals),
    lines: preview.lines.map((line) => ({ ...line, costPaise: 0 })),
    costing: preview.costing && withoutBuild(preview.costing),
    comparison: preview.comparison && {
      dcr: hideTotals(preview.comparison.dcr),
      nonDcr: hideTotals(preview.comparison.nonDcr),
    },
  };
}

export function detailFor(actor: Actor, detail: QuotationDetail): QuotationDetail {
  if (seesCost(actor)) return detail;
  return {
    ...detail,
    input: {
      ...detail.input,
      extras: detail.input.extras?.map((extra) => ({ ...extra, unitCostPaise: 0 })),
    },
    totals: hideTotals(detail.totals),
    lines: detail.lines.map((line) => ({ ...line, costPaise: 0 })),
    costing: detail.costing && withoutBuild(detail.costing),
  };
}
