import { describe, expect, it } from 'vitest';
import { toApiError } from './api-error';

describe('toApiError', () => {
  it('keeps the code and the details the screen needs for a next step', () => {
    const error = toApiError(409, {
      message: 'This number belongs to Asha, who left the team.',
      code: 'phone_of_past_member',
      details: { userId: 'u1', fullName: 'Asha', leftOn: '2026-10-03' },
    });
    expect(error.code).toBe('phone_of_past_member');
    expect(error.details).toEqual({ userId: 'u1', fullName: 'Asha', leftOn: '2026-10-03' });
  });

  it('gives empty details when the server sends none', () => {
    expect(toApiError(400, { message: 'Nope' }).details).toEqual({});
  });
});
