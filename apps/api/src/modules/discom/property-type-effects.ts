import {
  notify,
  projectActivities,
  projects,
  projectTasks,
  quotations,
  type Transaction,
  taskTemplates,
} from '@oneohm/database';
import {
  droppedWithSubsidy,
  needsRepricing,
  type SubsidyCategory,
  subsidyAfterTypeChange,
} from '@oneohm/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';

const CATEGORY_WORDS: Readonly<Record<SubsidyCategory, string>> = {
  individual: 'residential',
  society: 'housing society',
  commercial: 'commercial',
};

interface TypeChange {
  readonly requestId: string;
  readonly number: string;
  readonly propertyId: string;
  readonly from: SubsidyCategory;
  readonly to: SubsidyCategory;
}

/**
 * A completed property type change (PRD 3.15 "Project impact"): each project on the site
 * re-checks its subsidy (commercial removes it, with its untouched subsidy steps), and
 * the site's open quotations priced for the old type are flagged to their makers.
 * Everything is recorded in the project history and the audit trail.
 */
export async function applyPropertyTypeChange(
  tx: Transaction,
  change: TypeChange,
  userId: string,
): Promise<void> {
  const flagged = await flagOpenQuotations(tx, change, userId);
  const live = await tx
    .select({ id: projects.id, code: projects.code, subsidy: projects.subsidy })
    .from(projects)
    .where(
      and(
        eq(projects.propertyId, change.propertyId),
        inArray(projects.status, ['active', 'operational']),
      ),
    );
  for (const project of live) {
    const subsidy = subsidyAfterTypeChange(project.subsidy, change.to);
    const removed = subsidy === project.subsidy ? [] : await dropSubsidyTasks(tx, project.id);
    if (subsidy !== project.subsidy) {
      await tx
        .update(projects)
        .set({ subsidy, updatedAt: new Date() })
        .where(eq(projects.id, project.id));
    }
    await tx.insert(projectActivities).values({
      projectId: project.id,
      kind: 'change_request',
      message: impactMessage(change, project.subsidy, subsidy, removed, flagged),
      userId,
    });
    await recordAudit(tx, userId, 'project.subsidy_rechecked', 'project', project.id, {
      changeRequest: change.number,
      propertyType: { before: change.from, after: change.to },
      subsidy: { before: project.subsidy, after: subsidy },
      removedTasks: removed,
      quotationsToReprice: flagged,
    });
  }
}

/** Takes off subsidy-only steps nobody has started; their titles, for the record. */
async function dropSubsidyTasks(tx: Transaction, projectId: string): Promise<string[]> {
  const rows = await tx
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      status: projectTasks.status,
      startedAt: projectTasks.startedAt,
      conditions: taskTemplates.conditions,
    })
    .from(projectTasks)
    .innerJoin(taskTemplates, eq(taskTemplates.key, projectTasks.templateKey))
    .where(eq(projectTasks.projectId, projectId));
  const dropped = rows.filter((row) =>
    droppedWithSubsidy({ ...row, conditions: row.conditions as { subsidy?: boolean } | null }),
  );
  if (dropped.length > 0) {
    await tx.delete(projectTasks).where(
      inArray(
        projectTasks.id,
        dropped.map((row) => row.id),
      ),
    );
  }
  return dropped.map((row) => row.title);
}

/** Tells each open quotation's maker it was priced for the old property type. */
async function flagOpenQuotations(
  tx: Transaction,
  change: TypeChange,
  userId: string,
): Promise<string[]> {
  const open = await tx
    .select({
      id: quotations.id,
      number: quotations.number,
      status: quotations.status,
      subsidyCategory: quotations.subsidyCategory,
      createdByUserId: quotations.createdByUserId,
    })
    .from(quotations)
    .where(
      and(
        eq(quotations.propertyId, change.propertyId),
        inArray(quotations.status, ['draft', 'sent']),
      ),
    );
  const stale = open.filter((quotation) => needsRepricing(quotation, change.to));
  for (const quotation of stale) {
    if (!quotation.createdByUserId) continue;
    await notify(
      tx,
      { userId: quotation.createdByUserId },
      {
        kind: 'quotation_reprice',
        title: `Re-price ${quotation.number}`,
        body: `The site is now ${CATEGORY_WORDS[change.to]} (${change.number}); this quotation was priced as ${CATEGORY_WORDS[quotation.subsidyCategory]}.`,
        subject: { type: 'quotation', id: quotation.id },
        dedupeKey: `quotation_reprice:${quotation.id}:${change.requestId}`,
      },
    );
  }
  if (stale.length > 0) {
    await recordAudit(
      tx,
      userId,
      'quotation.flagged_for_repricing',
      'change_request',
      change.requestId,
      {
        quotations: stale.map((quotation) => quotation.number),
        propertyType: change.to,
      },
    );
  }
  return stale.map((quotation) => quotation.number);
}

function impactMessage(
  change: TypeChange,
  before: boolean,
  after: boolean,
  removed: readonly string[],
  flagged: readonly string[],
): string {
  const parts = [`The site is now ${CATEGORY_WORDS[change.to]} (${change.number}).`];
  if (before && !after) {
    parts.push('Subsidy removed from this project, as commercial sites get none.');
    if (removed.length > 0) parts.push(`Subsidy steps taken off: ${removed.join(', ')}.`);
  } else {
    parts.push(after ? 'Subsidy still applies.' : 'No subsidy on this project.');
  }
  if (flagged.length > 0) parts.push(`Re-price open quotations: ${flagged.join(', ')}.`);
  return parts.join(' ');
}
