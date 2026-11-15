import type { DatabaseExecutor } from '@oneohm/database';
import type { MetaTools, PlatformLead } from '@oneohm/marketing';
import type { LeadIntakeService } from '../crm/lead-intake.service';
import { campaignOfGoogle, campaignOfMetaAd, leadWithPlatformId, settingsCity } from './ad-lookup';
import { PermanentEventError } from './event-flow';
import { alertNoPhone, alertTestLead } from './lead-alerts';
import { formLeadInput } from './lead-mapping';

/** What came of a lead form entry: made, a test, nobody to call, or already a lead. */
export type FormLeadOutcome = 'created' | 'test' | 'no_phone' | 'known';

/**
 * A Meta lead form entry, read in full from Meta. This is the slow call: do it before the
 * transaction. Without a connection it is a failure waiting will not fix; a refusal from
 * Meta keeps its own kind (retryable ones are retried).
 */
export async function readMetaLead(
  tools: Pick<MetaTools, 'readLead'> | null,
  event: { readonly leadgenId: string },
): Promise<PlatformLead> {
  if (!tools) throw new PermanentEventError('Meta is not connected');
  return tools.readLead(event.leadgenId);
}

/**
 * A lead form entry already read, made a lead in the caller's transaction. A test lead only
 * makes a notice; an entry with no Indian mobile number alerts the leads desk (the event key
 * keeps a repeat quiet).
 */
export async function saveFormLead(
  tx: DatabaseExecutor,
  intake: Pick<LeadIntakeService, 'receive'>,
  lead: PlatformLead,
  prefix: 'meta' | 'google',
  eventKey: string,
  eventAdId: string | null = null,
): Promise<FormLeadOutcome> {
  if (lead.isTest) {
    await alertTestLead(tx, lead, eventKey);
    return 'test';
  }
  if (await leadWithPlatformId(tx, `${prefix}:${lead.platformLeadId}`)) return 'known';
  const adId = prefix === 'meta' ? (lead.adId ?? eventAdId) : null;
  const campaign = adId
    ? await campaignOfMetaAd(tx, adId)
    : prefix === 'google' && lead.campaignExternalId
      ? await campaignOfGoogle(tx, lead.campaignExternalId)
      : null;
  const input = formLeadInput(lead, campaign, await settingsCity(tx), prefix, adId);
  if (!input) {
    await alertNoPhone(tx, lead, campaign, eventKey);
    return 'no_phone';
  }
  await intake.receive(input, tx);
  return 'created';
}
