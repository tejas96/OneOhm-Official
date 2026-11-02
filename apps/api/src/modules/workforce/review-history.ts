interface ReviewRow {
  readonly outcome: string;
  readonly submittedBy: string | null;
  readonly at: Date;
  readonly decidedAt: Date | null;
}

const ACCEPTED = ['approved', 'self_approved'];

/**
 * What an approval task's reviews say for its points (spec 3.7, owner rulings 1A–3A):
 * the accepted hand-in; send-backs of that person only; no first-time right when the doer
 * was the only possible approver; and the time each send-back sat with the reviewer,
 * which never counts against the doer.
 */
export function reviewHistory(approval: boolean, reviews: readonly ReviewRow[]) {
  const accepted = approval
    ? reviews.filter((review) => ACCEPTED.includes(review.outcome)).at(-1)
    : undefined;
  const returned = reviews.filter((review) => review.outcome === 'returned');
  return {
    accepted,
    needsApproval: approval && accepted?.outcome !== 'self_approved',
    returns: returned.filter((review) => review.submittedBy === accepted?.submittedBy).length,
    withReviewer: returned
      .filter((review) => review.decidedAt !== null && review.decidedAt > review.at)
      .map((review) => ({
        party: 'reviewer',
        from: review.at.toISOString(),
        to: (review.decidedAt as Date).toISOString(),
      })),
  };
}
