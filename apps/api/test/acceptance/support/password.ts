import { OTP_CODE, Session } from './http';

/**
 * Gives a person a web password the way they would: asks for the text code on their
 * phone, then saves the password with it. Admins never type anyone's password, so the
 * scenarios that need a signed-in web person do it through the real two calls.
 */
export async function setWebPassword(phone: string, password: string): Promise<void> {
  const guest = new Session();
  await guest.post('/auth/password/code', { phone });
  await guest.post('/auth/password', { phone, code: OTP_CODE, password });
}
