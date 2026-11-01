import type { CustomerDocumentRequest, CustomerProject } from '@oneohm/api-contracts';
import { asksForFeedback } from './journey';

type Line = CustomerProject['payments']['milestones'][number];

/** One thing the customer needs to do (PRD 5.1 "pending customer actions"). */
export type Todo =
  | { readonly kind: 'payment'; readonly id: string; readonly line: Line }
  | { readonly kind: 'paper'; readonly id: string; readonly request: CustomerDocumentRequest }
  | { readonly kind: 'rating'; readonly id: string; readonly stage: string }
  | { readonly kind: 'feedback'; readonly id: string };

interface StageCard {
  readonly projectId: string;
  readonly stage: string;
  readonly rating?: unknown;
}

/**
 * What this home needs from the customer, most pressing first: money due, papers OneOhm
 * asked for, then ratings. The bank's share is never the customer's to do.
 */
export function todosFor(
  project: CustomerProject,
  requests: readonly CustomerDocumentRequest[],
  stageCards: readonly StageCard[],
): Todo[] {
  const payments = project.payments.milestones
    .filter((line) => line.payer === 'customer')
    .filter((line) => line.status === 'due' || line.status === 'partly_paid')
    .filter((line) => line.amountPaise > line.paidPaise)
    .map((line): Todo => ({ kind: 'payment', id: `pay:${line.key}`, line }));
  const papers = requests
    .filter((request) => request.status === 'open')
    // A request names its project by code; one with none is for any of the homes.
    .filter((request) => request.projectCode === null || request.projectCode === project.code)
    .map((request): Todo => ({ kind: 'paper', id: `paper:${request.id}`, request }));
  const ratings = stageCards
    .filter((card) => card.projectId === project.id && !card.rating)
    .map((card): Todo => ({ kind: 'rating', id: `rate:${card.stage}`, stage: card.stage }));
  const feedback: Todo[] = asksForFeedback(project) ? [{ kind: 'feedback', id: 'feedback' }] : [];
  return [...payments, ...papers, ...ratings, ...feedback];
}
