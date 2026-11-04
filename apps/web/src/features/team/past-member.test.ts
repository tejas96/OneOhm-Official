import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/api-error';
import { pastMemberOf } from './past-member';

const conflict = (code: string, details: Record<string, unknown>) =>
  new ApiError(409, 'This number belongs to Asha, who left the team.', code, {}, details);

describe('pastMemberOf', () => {
  it('reads who left and when from a past-member conflict', () => {
    expect(
      pastMemberOf(
        conflict('phone_of_past_member', {
          userId: 'u1',
          fullName: 'Asha',
          leftOn: '2026-10-03',
        }),
      ),
    ).toEqual({ userId: 'u1', fullName: 'Asha', leftOn: '2026-10-03' });
  });

  it('allows a missing leaving day', () => {
    expect(
      pastMemberOf(
        conflict('phone_of_past_member', { userId: 'u1', fullName: 'Asha', leftOn: null }),
      ),
    ).toEqual({ userId: 'u1', fullName: 'Asha', leftOn: null });
  });

  it('ignores other errors and incomplete details', () => {
    expect(pastMemberOf(conflict('duplicate_phone', { userId: 'u1', fullName: 'Asha' }))).toBe(
      null,
    );
    expect(pastMemberOf(conflict('phone_of_past_member', { fullName: 'Asha' }))).toBe(null);
    expect(pastMemberOf(new Error('boom'))).toBe(null);
  });
});
