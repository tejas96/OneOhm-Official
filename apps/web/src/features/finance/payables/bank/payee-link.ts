import type { PayoutOptions } from '@oneohm/api-contracts';

/** The page where the payee's bank details are kept. */
export function payeeHref(payee: NonNullable<PayoutOptions['payee']>): string {
  return payee.kind === 'vendor' ? `/inventory/vendors/${payee.id}` : `/contractors/${payee.id}`;
}
