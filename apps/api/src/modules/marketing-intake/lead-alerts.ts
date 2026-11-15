import { type DatabaseExecutor, notifyStaffHolders } from '@oneohm/database';
import type { PlatformLead } from '@oneohm/marketing';
import type { AdCampaign } from './ad-lookup';
import type { PermanentEventError } from './event-flow';
import { PLATFORM_WORDS } from './lead-mapping';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const subjectOf = (campaign: AdCampaign | null) =>
  campaign ? { subject: { type: 'marketing' as const, id: campaign.id } } : {};

/** A lead form entry with no Indian mobile number: the leads desk is told once, in plain words. */
export async function alertNoPhone(
  tx: DatabaseExecutor,
  lead: PlatformLead,
  campaign: AdCampaign | null,
  eventKey: string,
): Promise<void> {
  const platform = PLATFORM_WORDS[lead.platform];
  const who = lead.name?.trim() || 'someone';
  const given = lead.phone?.trim() || 'none given';
  await notifyStaffHolders(tx, 'leads.manage', {
    kind: 'marketing_lead_no_phone',
    title: `A ${platform} lead had no phone number`,
    body: `A ${platform} lead form entry from ${who} had no Indian mobile number: ${given}. Call or check it in the ad platform.`,
    ...subjectOf(campaign),
    dedupeKey: `form_no_phone:${eventKey}`,
  });
}

/** The platform's own test lead (from its testing tool): a notice, never a lead. */
export async function alertTestLead(
  tx: DatabaseExecutor,
  lead: PlatformLead,
  eventKey: string,
): Promise<void> {
  const platform = PLATFORM_WORDS[lead.platform];
  // Only the people who run Marketing (who sent the test), not every salesperson.
  await notifyStaffHolders(tx, 'marketing.manage', {
    kind: 'marketing_test_lead',
    title: `Test lead received from ${platform} — the connection works.`,
    body: `This was a test, so no lead was made.`,
    dedupeKey: `form_test:${eventKey}`,
  });
}

/** A failure waiting cannot fix: the leads desk is told once, and the event is not retried. */
export async function alertGiveUp(
  tx: DatabaseExecutor,
  reason: PermanentEventError,
  eventKey: string,
  what: string,
): Promise<void> {
  const nobody = reason.kind === 'nobody';
  await notifyStaffHolders(tx, 'leads.manage', {
    kind: 'marketing_lead_failed',
    title: nobody ? 'A lead came in but nobody can take leads' : `A ${what} could not be read`,
    body: nobody
      ? 'A lead came in but nobody can take leads. Give a staff role the leads permission, then add the lead by hand.'
      : `A ${what} could not be read: ${reason.message.replace(/\.$/, '')}. Open Marketing → Connections.`,
    ...(nobody ? {} : { subject: { type: 'marketing_connections' as const, id: NIL_UUID } }),
    dedupeKey: `form_failed:${eventKey}`,
  });
}
