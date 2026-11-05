import { type DatabaseExecutor, projectActivities } from '@oneohm/database';
import { logLead } from '../crm/lead-history';

/**
 * One line about a customer action where the team reads it: the project's log, else (an
 * action asked on a lead, before any project) the lead's timeline, internal.
 */
export async function logAction(
  tx: DatabaseExecutor,
  action: { readonly projectId: string | null; readonly leadId: string | null },
  entry: {
    readonly kind: 'document_request' | 'document_received' | 'customer_action';
    readonly message: string;
    readonly userId: string | null;
    readonly data: Record<string, unknown>;
    /** The step it belongs to, so the task's own history shows it. */
    readonly taskId?: string | null;
  },
): Promise<void> {
  if (action.projectId)
    await tx.insert(projectActivities).values({ projectId: action.projectId, ...entry });
  else if (action.leadId)
    await logLead(tx, action.leadId, entry.userId, 'note', entry.message, true);
}
