import { describe, expect, it } from 'vitest';
import { templateIdFor } from './otp-sender';

describe('templateIdFor', () => {
  const env = { MSG91_LOGIN_TEMPLATE_ID: 'L', MSG91_PASSWORD_RESET_TEMPLATE_ID: 'R' };

  it('picks the reset template for password_reset', () => {
    expect(templateIdFor(env, 'password_reset')).toBe('R');
    expect(templateIdFor(env, 'login')).toBe('L');
  });
});
