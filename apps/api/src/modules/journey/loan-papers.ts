import { customerActions, type DatabaseExecutor, homeNameOf } from '@oneohm/database';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { alertTaskOwner, resumeAfterWait, taskByKey } from './journey-store';

const LOAN_KEY = 'loan_documents';

/**
 * A loan paper was just asked for (redesign §4 Loan): when the "Collect loan documents" step is
 * waiting on the customer, the ask remembers which wait it belongs to (like the roof question does), so
 * that only that wait is ended when the paper is in. Runs in the ask's transaction.
 */
export async function loanPaperAsked(
  tx: DatabaseExecutor,
  ask: { readonly id: string; readonly projectId: string | null; readonly category: string | null },
): Promise<void> {
  if (ask.category !== 'bank_loan' || !ask.projectId) return;
  const task = await taskByKey(tx, ask.projectId, LOAN_KEY);
  // Asked during a wait on someone else (the bank, DISCOM): it belongs to no customer wait, now or later.
  const patch =
    task?.status === 'waiting' && task.waitingParty !== 'customer'
      ? { otherWait: true }
      : task?.status === 'waiting' && task.waitingSince
        ? { waitSince: task.waitingSince.toISOString() }
        : null;
  if (!patch) return;
  await tx
    .update(customerActions)
    .set({ payload: sql`${customerActions.payload} || ${JSON.stringify(patch)}::jsonb` })
    .where(eq(customerActions.id, ask.id));
}

/**
 * The "Collect loan documents" step just started waiting on the customer (redesign §4 Loan): the loan
 * papers already asked for and still open belong to this wait, so each remembers it (ask first, wait
 * later). A paper that already remembers a wait keeps it; a paper asked during some other wait never
 * got one. Runs in the wait's transaction.
 */
export async function loanWaitStarted(tx: DatabaseExecutor, projectId: string): Promise<void> {
  const task = await taskByKey(tx, projectId, LOAN_KEY);
  if (task?.status !== 'waiting' || task.waitingParty !== 'customer' || !task.waitingSince) return;
  await tx
    .update(customerActions)
    .set({
      payload: sql`${customerActions.payload} || ${JSON.stringify({ waitSince: task.waitingSince.toISOString() })}::jsonb`,
    })
    .where(
      and(
        eq(customerActions.projectId, projectId),
        eq(customerActions.type, 'paper'),
        eq(customerActions.category, 'bank_loan'),
        inArray(customerActions.status, ['open', 'received']),
        sql`${customerActions.payload}->>'waitSince' is null`,
        sql`${customerActions.payload}->>'otherWait' is null`,
      ),
    );
}

/**
 * A loan paper the customer sent was checked (redesign §4 Loan): when no other loan paper is still asked
 * for or waiting for its check, and the "Collect loan documents" step is waiting on the customer because
 * of a loan paper ask, that wait ends and its owner is told. Any other wait (a different reason) is left
 * alone. Runs in the check's transaction.
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
  const task = await taskByKey(tx, checked.projectId, LOAN_KEY);
  if (task?.status !== 'waiting' || task.waitingParty !== 'customer' || !task.waitingSince) return;
  const since = task.waitingSince.toISOString();
  const [own] = await tx
    .select({ id: customerActions.id })
    .from(customerActions)
    .where(
      and(
        eq(customerActions.projectId, checked.projectId),
        eq(customerActions.category, 'bank_loan'),
        sql`${customerActions.payload}->>'waitSince' = ${since}`,
      ),
    )
    .limit(1);
  if (!own) return;
  await resumeAfterWait(tx, task, since);
  await alertTaskOwner(tx, task, {
    kind: 'loan_papers_checked',
    title: 'All the loan papers are in',
    body: `${await homeNameOf(tx, checked.projectId)}: every loan paper asked from the customer is checked.`,
    key: `loan_papers_checked:${checked.id}`,
  });
}
