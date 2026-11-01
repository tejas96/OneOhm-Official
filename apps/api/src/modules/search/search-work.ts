import {
  customers,
  documents,
  payments,
  projects,
  projectTasks,
  serviceCategories,
  serviceRequests,
} from '@oneohm/database';
import { and, asc, desc, eq, gt, isNotNull, or, type SQL, sql } from 'drizzle-orm';
import { matchRank, matchWords } from '../../common/search-match';
import { currentProjectFiles } from '../documents/document-read';
import { type Finder, factsOf, hitOf } from './search-hit';
import { seesAllDocuments, seesAllTasks } from './search-scope';

/** Tasks by title or project; crews and staff without oversight find only their own. */
export const findTasks: Finder = async ({ db, actor, words, raw, limit }) => {
  const rows = await db
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      status: projectTasks.status,
      projectId: projects.id,
      code: projects.code,
      project: projects.name,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(
      and(
        seesAllTasks(actor) ? undefined : eq(projectTasks.assigneeUserId, actor.userId),
        matchWords(words, { text: [projectTasks.title, projects.name], codes: [projects.code] }),
      ),
    )
    .orderBy(
      sql`(${projectTasks.status} = 'completed')`,
      matchRank(raw, [projectTasks.title, projects.code]),
      asc(projectTasks.dueDate),
    )
    .limit(limit);
  return rows.map((row) =>
    hitOf('tasks', row.id, row.title, {
      facts: factsOf(row.code, row.project),
      state: row.status,
      parent: { type: 'projects', id: row.projectId },
    }),
  );
};

/** Money received, by receipt number, reference, customer or project code. */
export const findPayments: Finder = async ({ db, words, raw, limit }) => {
  const rows = await db
    .select({
      id: payments.id,
      receipt: payments.receiptNumber,
      reference: payments.reference,
      amountPaise: payments.amountPaise,
      projectId: projects.id,
      code: projects.code,
      customer: customers.name,
    })
    .from(payments)
    .innerJoin(projects, eq(projects.id, payments.projectId))
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .where(
      and(
        or(gt(payments.amountPaise, 0), isNotNull(payments.reversesPaymentId)),
        matchWords(words, {
          text: [customers.name, payments.reference],
          codes: [payments.receiptNumber, projects.code],
        }),
      ),
    )
    .orderBy(matchRank(raw, [payments.receiptNumber, customers.name]), desc(payments.createdAt))
    .limit(limit);
  return rows.map((row) =>
    hitOf('payments', row.id, row.receipt ?? row.reference ?? row.code, {
      facts: factsOf(row.customer, row.code),
      amountPaise: row.amountPaise,
      parent: { type: 'projects', id: row.projectId },
    }),
  );
};

/** Service requests and planned visits by customer, project, category or what was asked. */
export const findServiceRequests: Finder = async ({ db, words, raw, limit }) => {
  const rows = await db
    .select({
      id: serviceRequests.id,
      category: serviceRequests.category,
      label: serviceCategories.label,
      status: serviceRequests.status,
      customer: customers.name,
      code: projects.code,
    })
    .from(serviceRequests)
    .innerJoin(customers, eq(customers.id, serviceRequests.customerId))
    .leftJoin(projects, eq(projects.id, serviceRequests.projectId))
    .leftJoin(serviceCategories, eq(serviceCategories.key, serviceRequests.category))
    .where(
      matchWords(words, {
        text: [serviceRequests.description, customers.name, serviceCategories.label],
        codes: [projects.code],
        phones: [customers.phoneE164],
      }),
    )
    .orderBy(
      matchRank(raw, [customers.name, serviceCategories.label]),
      desc(serviceRequests.createdAt),
    )
    .limit(limit);
  return rows.map((row) =>
    hitOf('service', row.id, row.label ?? row.category, {
      facts: factsOf(row.customer, row.code),
      state: row.status,
    }),
  );
};

/** Where a file opens: its project, else its customer, lead, vendor or contractor. */
function parentOf(row: typeof documents.$inferSelect) {
  if (row.projectId) return { type: 'projects' as const, id: row.projectId };
  if (row.customerId) return { type: 'customers' as const, id: row.customerId };
  if (row.leadId) return { type: 'leads' as const, id: row.leadId };
  if (row.vendorId) return { type: 'vendors' as const, id: row.vendorId };
  if (row.contractorId) return { type: 'contractors' as const, id: row.contractorId };
  return null;
}

/** Current files by name, project or customer; others than office staff find only their own. */
export const findDocuments: Finder = async ({ db, actor, words, raw, limit }) => {
  const own: SQL | undefined = seesAllDocuments(actor)
    ? undefined
    : or(
        eq(documents.uploadedByUserId, actor.userId),
        sql`exists (select 1 from ${projectTasks} where ${projectTasks.id} = ${documents.taskId} and ${projectTasks.assigneeUserId} = ${actor.userId})`,
      );
  const rows = await db
    .select({ document: documents, code: projects.code, customer: customers.name })
    .from(documents)
    .leftJoin(projects, eq(projects.id, documents.projectId))
    .leftJoin(customers, eq(customers.id, documents.customerId))
    .where(
      and(
        currentProjectFiles,
        own,
        matchWords(words, { text: [documents.name, customers.name], codes: [projects.code] }),
      ),
    )
    .orderBy(matchRank(raw, [documents.name]), desc(documents.createdAt))
    .limit(limit);
  return rows.map(({ document, code, customer }) =>
    hitOf('documents', document.id, document.name, {
      facts: factsOf(code, customer),
      state: document.category,
      parent: parentOf(document),
    }),
  );
};
