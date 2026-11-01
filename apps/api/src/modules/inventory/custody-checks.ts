import type { CustodyHolding } from '@oneohm/api-contracts';
import { contractors, type DatabaseExecutor, projectTasks, workOrders } from '@oneohm/database';
import { checkDraw, checkSerials, type DrawProblem, roundQuantity } from '@oneohm/domain';
import { and, eq, ne } from 'drizzle-orm';
import { conflict, invalid, notFound } from '../../common/http/errors';
import type { SlipLine } from './custody-write';

interface LineInput {
  readonly productId: string;
  readonly lineKey: string | null;
  readonly quantity: number;
  readonly serials: readonly string[];
}

/** The same item twice on one slip becomes one line. */
export function mergeLines(lines: readonly LineInput[]): LineInput[] {
  const merged = new Map<string, LineInput>();
  for (const line of lines) {
    const key = `${line.productId}|${line.lineKey ?? ''}`;
    const seen = merged.get(key);
    merged.set(
      key,
      seen
        ? {
            ...seen,
            quantity: roundQuantity(seen.quantity + line.quantity),
            serials: [...seen.serials, ...line.serials],
          }
        : line,
    );
  }
  return [...merged.values()];
}

/** Material goes only to a contractor with a live work order on the project. */
export async function contractorOnProject(
  db: DatabaseExecutor,
  contractorId: string,
  projectId: string,
) {
  const [contractor] = await db.select().from(contractors).where(eq(contractors.id, contractorId));
  if (!contractor) throw notFound('That contractor');
  const [order] = await db
    .select({ id: workOrders.id })
    .from(workOrders)
    .where(
      and(
        eq(workOrders.contractorId, contractorId),
        eq(workOrders.projectId, projectId),
        ne(workOrders.status, 'cancelled'),
      ),
    )
    .limit(1);
  if (!order)
    throw conflict(`${contractor.name} has no work order on this project.`, 'no_work_order');
  return contractor;
}

export async function assertTaskOnProject(
  db: DatabaseExecutor,
  taskId: string | null,
  projectId: string,
) {
  if (!taskId) return;
  const [task] = await db
    .select({ projectId: projectTasks.projectId })
    .from(projectTasks)
    .where(eq(projectTasks.id, taskId));
  if (task?.projectId !== projectId) throw invalid('That task is not on this project.');
}

const fmt = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 3 });

const DRAW_PROBLEM: Readonly<Record<DrawProblem, (holding: CustodyHolding) => string>> = {
  not_positive: () => 'Enter a quantity above 0.',
  not_whole: (holding) => `Count ${holding.name} in whole units.`,
  more_than_held: (holding) =>
    `Only ${fmt(holding.balance)} ${holding.unit} of ${holding.name} is with this contractor.`,
};

/**
 * Lines drawn from what the contractor holds (usage or return): each must match a
 * holding and stay within its balance. Returns of serialised items name their units.
 */
export function drawLines(
  holdings: readonly CustodyHolding[],
  lines: readonly LineInput[],
  needSerials: boolean,
): SlipLine[] {
  const fieldErrors: Record<string, string> = {};
  const result: SlipLine[] = [];
  mergeLines(lines).forEach((line, index) => {
    const holding = holdings.find(
      (row) => row.productId === line.productId && row.lineKey === line.lineKey,
    );
    if (!holding) {
      fieldErrors[`lines.${index}`] = 'This item is not with this contractor on this project.';
      return;
    }
    const problem = checkDraw(holding.balance, line.quantity, holding.serialised);
    if (problem) {
      fieldErrors[`lines.${index}`] = DRAW_PROBLEM[problem](holding);
      return;
    }
    const serials = needSerials && holding.serialised ? serialsFor(holding, line) : null;
    if (typeof serials === 'string') {
      fieldErrors[`lines.${index}`] = serials;
      return;
    }
    result.push({
      productId: line.productId,
      lineKey: holding.lineKey,
      quantity: line.quantity,
      serials: serials ?? [],
    });
  });
  if (Object.keys(fieldErrors).length > 0)
    throw invalid(Object.values(fieldErrors)[0] ?? 'Some lines need fixing.', fieldErrors);
  return result;
}

/** The serials on a return, or the problem with them. */
function serialsFor(holding: CustodyHolding, line: LineInput): string[] | string {
  const checked = checkSerials(line.quantity, line.serials);
  if ('problem' in checked)
    return checked.problem === 'count_mismatch'
      ? `Enter one serial for each ${holding.name} returned.`
      : 'Each serial once, none blank.';
  const unknown = checked.serials.find((serial) => !holding.serials.includes(serial));
  return unknown ? `${unknown} was not issued to this contractor here.` : checked.serials;
}
