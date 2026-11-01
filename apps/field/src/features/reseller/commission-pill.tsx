import type { ResellerCustomer } from '@oneohm/api-contracts';
import { StatusPill, type Tone } from '@oneohm/mobile-ui';
import { COMMISSION_STATE } from '@/copy/reseller';

type State = NonNullable<ResellerCustomer['commission']>['status'];

const TONE: Readonly<Record<State, Tone>> = {
  upcoming: 'neutral',
  pending: 'review',
  approved: 'onTrack',
  paid: 'done',
  rejected: 'blocked',
};

/** Where a commission stands, in the same colours finance sees. */
export function CommissionPill({ status }: { readonly status: State }) {
  return <StatusPill size="sm" tone={TONE[status]} label={COMMISSION_STATE[status]} />;
}
