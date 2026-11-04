import type { ServiceTicket } from '@oneohm/api-contracts';
import { type SlaHours, slaDueDates } from '@oneohm/domain';

export type Patch = {
  status?: ServiceTicket['status'] | undefined;
  assigneeUserId?: string | null | undefined;
  category?: string | undefined;
  resolutionNote?: string | null | undefined;
};

interface Before {
  readonly status: string;
  readonly respondedAt: Date | null;
  readonly createdAt: Date;
}

/** The new category's service levels, when the patch moves the request to another one. */
export interface Recategory {
  readonly hours: SlaHours | null;
  /** A planned visit's day, which its fix-by time counts from. */
  readonly scheduledFor: string | null;
}

/**
 * The columns a patch changes. Leaving "open" for the first time answers the request; a new
 * category brings its own reply-by and fix-by times, counted from when it was raised.
 */
export function changesFor(patch: Patch, before: Before, now: Date, recategory?: Recategory) {
  const moving = patch.status !== undefined && patch.status !== before.status;
  const answered = moving && patch.status !== 'open' && !before.respondedAt;
  const due =
    recategory?.hours && slaDueDates(recategory.hours, before.createdAt, recategory.scheduledFor);
  return {
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.assigneeUserId !== undefined ? { assigneeUserId: patch.assigneeUserId } : {}),
    ...(patch.category ? { category: patch.category } : {}),
    ...(recategory
      ? {
          responseDueAt: due ? due.responseDueAt : null,
          resolutionDueAt: due ? due.resolutionDueAt : null,
        }
      : {}),
    ...(patch.resolutionNote !== undefined ? { resolutionNote: patch.resolutionNote } : {}),
    ...(patch.status ? { resolvedAt: patch.status === 'resolved' ? now : null } : {}),
    ...(answered ? { respondedAt: now } : {}),
    updatedAt: now,
  };
}
