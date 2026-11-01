import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorFrom, describeError, fieldErrorsOf, NetworkError } from './api-error';

describe('apiErrorFrom', () => {
  it('keeps the server sentence, code and field messages', () => {
    const error = apiErrorFrom(409, {
      message: 'Asha already has an open lead with this number.',
      code: 'duplicate_lead:abc',
      fieldErrors: { phone: 'Already registered.' },
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('duplicate_lead:abc');
    expect(fieldErrorsOf(error)).toEqual({ phone: 'Already registered.' });
  });

  it('falls back to a calm sentence for unexpected bodies', () => {
    expect(describeError(apiErrorFrom(500, 'oops'))).toBe(
      'Something went wrong. Please try again.',
    );
    expect(fieldErrorsOf(new Error('x'))).toEqual({});
  });

  it('says plainly when the phone is offline', () => {
    expect(new NetworkError().status).toBe(0);
  });
});
