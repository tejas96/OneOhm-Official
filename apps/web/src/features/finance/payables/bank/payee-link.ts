import type { PayoutOptions } from '@oneohm/api-contracts';

/** The page where the payee's bank details are kept (an employee's are typed in the Pay dialog). */
export function payeeHref(payee: NonNullable<PayoutOptions['payee']>): string {
  if (payee.kind === 'employee') return '/team';
  return payee.kind === 'vendor' ? `/inventory/vendors/${payee.id}` : `/contractors/${payee.id}`;
}
