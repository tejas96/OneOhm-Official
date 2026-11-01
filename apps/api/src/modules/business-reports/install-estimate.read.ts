import {
  contractorMembers,
  contractorRates,
  type DatabaseExecutor,
  projectContractors,
  projects,
  projectTasks,
  quotationLines,
  quotations,
} from '@oneohm/database';
import {
  type ContractorRate,
  type InstallEstimate,
  installEstimate,
  type ProjectType,
  personDays,
  rateLineOf,
  toCostingCard,
} from '@oneohm/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { pricedLinesOnly } from '../quotations/quotation-rows';

export interface ProjectInstallEstimate extends InstallEstimate {
  /** The quotation's own labour cost, which a contractor's card replaces. */
  readonly companyPaise: number;
}

type QuoteLine = {
  key: string;
  category: string;
  costPaise: number;
  quantity: number;
  unit: string;
};

/** Labour lines of a quotation (installation work, not hired equipment) and their crew days. */
function companyLabour(snapshot: unknown, lines: readonly QuoteLine[]) {
  const card = toCostingCard((snapshot as { rates?: unknown }).rates);
  const labour = lines.filter(
    (line) => line.category === 'installation' && rateLineOf(card, line.key)?.kind !== 'equipment',
  );
  return {
    paise: labour.reduce((sum, line) => sum + line.costPaise, 0),
    days: personDays(card, lines),
  };
}

/**
 * The estimated installation cost of each project (PRD 3.13, D12): the project
 * contractor's rate card when it has one, else the company labour on the quotation.
 */
export async function readInstallEstimates(
  db: DatabaseExecutor,
  projectQuotes: readonly { readonly projectId: string; readonly quotationId: string }[],
): Promise<Map<string, ProjectInstallEstimate>> {
  if (projectQuotes.length === 0) return new Map();
  const projectIds = projectQuotes.map((row) => row.projectId);
  const quotationIds = projectQuotes.map((row) => row.quotationId);
  const [quotes, lines, chosen] = await Promise.all([
    db
      .select({ id: quotations.id, snapshot: quotations.snapshot })
      .from(quotations)
      .where(inArray(quotations.id, quotationIds)),
    db
      .select({
        quotationId: quotationLines.quotationId,
        key: quotationLines.key,
        category: quotationLines.category,
        costPaise: quotationLines.costPaise,
        quantity: quotationLines.quantity,
        unit: quotationLines.unit,
      })
      .from(quotationLines)
      .where(and(inArray(quotationLines.quotationId, quotationIds), pricedLinesOnly())),
    db
      .select({
        projectId: projectContractors.projectId,
        contractorId: projectContractors.contractorId,
        type: projects.type,
        capacityWp: projects.capacityWp,
      })
      .from(projectContractors)
      .innerJoin(projects, eq(projects.id, projectContractors.projectId))
      .where(inArray(projectContractors.projectId, projectIds)),
  ]);
  const contractorIds = [...new Set(chosen.map((row) => row.contractorId))];
  const [rates, tasks] = contractorIds.length
    ? await Promise.all([
        db
          .select()
          .from(contractorRates)
          .where(
            and(
              inArray(contractorRates.contractorId, contractorIds),
              eq(contractorRates.active, true),
            ),
          ),
        db
          .select({
            projectId: projectTasks.projectId,
            contractorId: contractorMembers.contractorId,
            templateKey: projectTasks.templateKey,
            title: projectTasks.title,
          })
          .from(projectTasks)
          .innerJoin(contractorMembers, eq(contractorMembers.userId, projectTasks.assigneeUserId))
          .where(inArray(projectTasks.projectId, projectIds)),
      ])
    : [[], []];
  const result = new Map<string, ProjectInstallEstimate>();
  for (const { projectId, quotationId } of projectQuotes) {
    const quote = quotes.find((row) => row.id === quotationId);
    if (!quote) continue;
    const labour = companyLabour(
      quote.snapshot,
      lines.filter((line) => line.quotationId === quotationId),
    );
    const pick = chosen.find((row) => row.projectId === projectId);
    const job = pick
      ? {
          rates: rates
            .filter((rate) => rate.contractorId === pick.contractorId)
            .map(
              (rate): ContractorRate => ({
                id: rate.id,
                basis: rate.basis,
                taskKey: rate.taskKey,
                projectType: rate.projectType as ProjectType | null,
                label: rate.label,
                amountPaise: rate.amountPaise,
              }),
            ),
          tasks: tasks.filter(
            (task) => task.projectId === projectId && task.contractorId === pick.contractorId,
          ),
          capacityWp: pick.capacityWp,
          projectType: pick.type as ProjectType,
          personDays: labour.days,
        }
      : null;
    result.set(projectId, { ...installEstimate(labour.paise, job), companyPaise: labour.paise });
  }
  return result;
}
