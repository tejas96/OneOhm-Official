import { ApiError } from '@/lib/api/api-error';

/** Someone who left the team but still holds the mobile number being added. */
export interface PastMember {
  readonly userId: string;
  readonly fullName: string;
  /** The day they left ("2026-10-03"), or null when it was not recorded. */
  readonly leftOn: string | null;
}

/** The past member behind a `phone_of_past_member` conflict, or null for any other error. */
export function pastMemberOf(error: unknown): PastMember | null {
  if (!(error instanceof ApiError) || error.code !== 'phone_of_past_member') return null;
  const { userId, fullName, leftOn } = error.details;
  if (typeof userId !== 'string' || typeof fullName !== 'string') return null;
  return { userId, fullName, leftOn: typeof leftOn === 'string' ? leftOn : null };
}
