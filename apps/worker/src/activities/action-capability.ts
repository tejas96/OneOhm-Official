/**
 * Who is alerted about an ask: the people who manage that kind of work. A visit ask of a service
 * or AMC visit goes to the service desk, a lead's survey to those who manage leads; the rest
 * (and every other ask) to those who manage projects. The same rule as `alertVisitOwner`.
 */
export function capabilityOf(action: {
  readonly type: string;
  readonly leadId: string | null;
  readonly projectId: string | null;
  readonly payload: Record<string, unknown>;
}):
  | 'projects.manage'
  | 'service.manage'
  | 'leads.manage'
  | 'finance.record_payments'
  | 'documents.upload' {
  if (action.type === 'payout') return 'finance.record_payments';
  // A paper the customer sent is checked by those who handle documents.
  if (action.type === 'paper') return 'documents.upload';
  if (action.type !== 'visit_pick') return 'projects.manage';
  const kind = action.payload.visitKind;
  if (kind === 'amc' || kind === 'service') return 'service.manage';
  return action.leadId && !action.projectId ? 'leads.manage' : 'projects.manage';
}
