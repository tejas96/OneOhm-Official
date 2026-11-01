import type {
  ProjectChangeImpact,
  ProjectChangeInput,
  QuotationDetail,
  QuotationInput,
} from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  products,
  type projects,
  quotationLines,
  quotations,
  stockReservations,
} from '@oneohm/database';
import {
  changeKinds,
  flagsAfterChange,
  materialDelta,
  planTaskChange,
  priceImpact,
  type TaskPlan,
} from '@oneohm/domain';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { invalid } from '../../common/http/errors';
import { quotationNeeds } from '../inventory/quotation-needs';
import type { PricedQuotation } from '../quotations/quotation-pricing.service';
import { pricedLinesOnly } from '../quotations/quotation-rows';
import { lastCustomerPayment } from '../quotations/revision-accept';
import { changedInput, choicesOf, keepsAcceptedExtras, scopeViews, sideOf } from './change-input';
import { loadPlanInput } from './change-plan-io';

type ProjectRow = typeof projects.$inferSelect;

export interface ChangeImpact {
  readonly impact: ProjectChangeImpact;
  /** The changed quotation input, to draft the revision from. */
  readonly input: QuotationInput;
}

/** What the accepted quotation and the changed one need from the store, by product. */
async function material(
  db: DatabaseExecutor,
  projectId: string,
  accepted: QuotationDetail,
  input: QuotationInput,
  priced: PricedQuotation,
): Promise<ProjectChangeImpact['material']> {
  const [row] = await db.select().from(quotations).where(eq(quotations.id, accepted.id));
  const lines = await db
    .select({
      key: quotationLines.key,
      productId: quotationLines.productId,
      quantity: quotationLines.quantity,
    })
    .from(quotationLines)
    .where(
      and(
        eq(quotationLines.quotationId, accepted.id),
        isNotNull(quotationLines.productId),
        pricedLinesOnly(),
      ),
    );
  const before = row ? quotationNeeds(row, lines) : [];
  const after = quotationNeeds(
    {
      panelProductId: input.panelProductId,
      moduleCount: priced.preview.totals.moduleCount,
      inverterProductId: input.inverterProductId,
      batteryProductId: input.batteryProductId ?? null,
    },
    priced.lines.filter((line) => line.extra !== 'optional'),
  );
  const changes = materialDelta(before, after);
  if (changes.length === 0) return [];
  const ids = changes.map((change) => change.productId);
  const catalog = await db.select().from(products).where(inArray(products.id, ids));
  const held = await db
    .select({ productId: stockReservations.productId, quantity: stockReservations.quantity })
    .from(stockReservations)
    .where(and(eq(stockReservations.projectId, projectId), eq(stockReservations.status, 'active')));
  return changes.map((change) => {
    const product = catalog.find((item) => item.id === change.productId);
    return {
      ...change,
      name: product?.name ?? '',
      unit: product?.unit ?? '',
      reserved: held
        .filter((item) => item.productId === change.productId)
        .reduce((sum, item) => sum + item.quantity, 0),
    };
  });
}

function tasksView(plan: TaskPlan): ProjectChangeImpact['tasks'] {
  return {
    added: plan.added.map(({ key, title, startDate, dueDate }) => ({
      key,
      title,
      startDate,
      dueDate,
    })),
    removed: plan.removed.map(({ key, title, status }) => ({ key, title, status })),
    kept: plan.kept.map(({ key, title, status }) => ({ key, title, status })),
    moved: plan.shifts.length,
    finishBefore: plan.finishBefore,
    finishAfter: plan.finishAfter,
    finishMoveDays: plan.finishMoveDays,
  };
}

/**
 * Everything shown before approval (PRD 3.15): the new price and the difference, the
 * subsidy and state support with their reasons, the tasks added or taken off and how far
 * the finish moves, and the material that changes. Priced as the accepted quotation was
 * (its rates and rule), so the difference is the change and nothing else.
 */
export async function changeImpact(
  db: DatabaseExecutor,
  price: (input: QuotationInput) => Promise<PricedQuotation>,
  project: ProjectRow,
  accepted: QuotationDetail,
  change: ProjectChangeInput,
): Promise<ChangeImpact> {
  if (!keepsAcceptedExtras(accepted.input, change))
    throw invalid('Lines already on the quotation stay as they are.', {
      extras: 'Add new lines after the existing ones.',
    });
  const input = changedInput(accepted.input, change);
  const kinds = changeKinds(choicesOf(accepted.input), choicesOf(input));
  if (kinds.length === 0)
    throw invalid('Nothing changes yet.', { targetWp: 'Change the size, a product or a line.' });
  const priced = await price(input);
  const totals = priced.preview.totals;
  const money = priceImpact(sideOf(accepted.totals), sideOf(totals));
  const last = await lastCustomerPayment(db, project.id);
  const fits =
    money.differencePaise !== 0 &&
    last?.status === 'upcoming' &&
    last.amount + money.differencePaise > 0;
  const flags = flagsAfterChange(
    project,
    choicesOf(accepted.input),
    choicesOf(input),
    totals.subsidyPaise,
  );
  const plan = planTaskChange(await loadPlanInput(db, project, flags));
  const [before, after] = await scopeViews(db, [
    { input: accepted.input, totals: accepted.totals },
    { input, totals },
  ]);
  if (!before || !after) throw new Error('Scope views missing.');
  return {
    input,
    impact: {
      kinds,
      scope: { before, after },
      price: money,
      payment: {
        label: fits && last ? last.label : null,
        newAmountPaise: fits && last ? last.amount + money.differencePaise : null,
      },
      tasks: tasksView(plan),
      material: await material(db, project.id, accepted, input, priced),
    },
  };
}
