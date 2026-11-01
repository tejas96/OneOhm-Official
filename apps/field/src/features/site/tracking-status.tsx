import type { TrackingStatus as Tracking } from '@oneohm/api-contracts';
import { StatusPill } from '@oneohm/mobile-ui';
import { TRACKING } from '@/copy/site';

/** The visible "Location on during work" status (PRD 4.3: no hidden tracking). */
export function TrackingStatus({
  state,
}: {
  readonly state: Tracking['state'];
  /** Kept for callers; the working hours show on the card itself. */
  readonly hours?: Tracking['hours'] | undefined;
}) {
  if (state === 'on') return <StatusPill size="sm" tone="onTrack" label={TRACKING.on} />;
  if (state === 'outside_hours')
    return <StatusPill size="sm" tone="waiting" label={TRACKING.outsideHours} />;
  return (
    <StatusPill
      size="sm"
      tone="neutral"
      label={state === 'policy_off' ? TRACKING.policyOff : TRACKING.noConsent}
    />
  );
}
