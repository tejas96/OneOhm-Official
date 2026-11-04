/**
 * What a viewer may do with a task's proposed assignee: confirm or pick someone else
 * needs the right to assign, and nobody confirms a proposal that names themselves.
 */
export function proposalRights(input: {
  readonly canAssign: boolean;
  readonly viewerId: string;
  readonly proposedId: string | null;
}): { readonly confirm: boolean; readonly pick: boolean } {
  const { canAssign, viewerId, proposedId } = input;
  return { confirm: canAssign && proposedId !== null && proposedId !== viewerId, pick: canAssign };
}
