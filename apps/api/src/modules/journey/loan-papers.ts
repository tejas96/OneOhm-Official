import { customerActions, type DatabaseExecutor, homeNameOf } from '@oneohm/database';
import { and, eq, inArray } from 'drizzle-orm';
import { alertTaskOwner, resumeAfterWait, taskByKey } from './journey-store';

/**
 * A loan paper the customer sent was checked (redesign §4 Loan): when no other loan paper is still
 * asked for or waiting for its check, the "Collect loan documents" step stops waiting on the customer
 * and its owner is told. Runs in the check's transaction.
 */
export async function loanPapersChecked(
  tx: DatabaseExecutor,
  checked: {
    readonly id: string;
    readonly projectId: string | null;
    readonly category: string | null;
  },
): Promise<void> {
  if (checked.category !== 'bank_loan' || !checked.projectId) return;
  const [left] = await tx
    .select({ id: customerActions.id })
    .from(customerActions)
    .where(
      and(
        eq(customerActions.projectId, checked.projectId),
        eq(customerActions.type, 'paper'),
        eq(customerActions.category, 'bank_loan'),
        inArray(customerActions.status, ['open', 'received']),
      ),
    )
    .limit(1);
  if (left) return;
  const task = await taskByKey(tx, checked.projectId, 'loan_documents');
  if (!task || task.status === 'completed') return;
  await resumeAfterWait(tx, task);
  await alertTaskOwner(tx, task, {
    kind: 'loan_papers_checked',
    title: 'All the loan papers are in',
    body: `${await homeNameOf(tx, checked.projectId)}: every loan paper asked from the customer is checked.`,
    key: `loan_papers_checked:${checked.id}`,
  });
}
