import type { SalesReport } from '@oneohm/api-contracts';
import { campaignLabel } from '@oneohm/domain';
import type { LeadFact } from './sales-report.read';

const QUOTED_OR_LATER = new Set(['quoted', 'won']);

/** Where a lead came from, as one report row: its campaign code, else its ad, else its UTM campaign. */
function campaignOf(lead: LeadFact, names: ReadonlyMap<string, string>) {
  const label = campaignLabel({
    ...lead,
    campaignName: (lead.campaignCode && names.get(lead.campaignCode)) || null,
  });
  if (!label) return { key: 'none', label: 'No campaign' };
  if (lead.campaignCode) return { key: lead.campaignCode, label };
  if (lead.adId) return { key: `ad:${lead.adId}`, label };
  if (lead.utmCampaign) return { key: `utm:${lead.utmCampaign}`, label };
  return { key: 'none', label: 'No campaign' };
}

/**
 * The period's leads grouped by the ad or campaign that brought them: how many were
 * quoted and won, how many got an instant estimate, the value won, and the money the customers have paid since.
 */
export function byCampaign(
  cohort: readonly LeadFact[],
  names: ReadonlyMap<string, string>,
  wonValue: ReadonlyMap<string, number>,
  collected: ReadonlyMap<string, number>,
  quotedLeadIds: ReadonlySet<string>,
  estimatedLeadIds: ReadonlySet<string>,
): SalesReport['byCampaign'] {
  const rows = new Map<string, SalesReport['byCampaign'][number]>();
  for (const lead of cohort) {
    const { key, label } = campaignOf(lead, names);
    const row = rows.get(key) ?? {
      key,
      label,
      leads: 0,
      estimates: 0,
      quoted: 0,
      won: 0,
      wonValuePaise: 0,
      collectedPaise: 0,
    };
    row.leads += 1;
    if (estimatedLeadIds.has(lead.id)) row.estimates += 1;
    if (quotedLeadIds.has(lead.id) || QUOTED_OR_LATER.has(lead.stage) || lead.wonAt)
      row.quoted += 1;
    if (lead.wonAt) {
      row.won += 1;
      row.wonValuePaise += wonValue.get(lead.id) ?? 0;
    }
    row.collectedPaise += collected.get(lead.id) ?? 0;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.leads - a.leads || a.label.localeCompare(b.label));
}
