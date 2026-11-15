import type { SalesReport } from '@oneohm/api-contracts';
import { campaignLabel, costPer, returnOnSpend } from '@oneohm/domain';
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
 * quoted and won, how many got an instant estimate, how many paid the advance, the value won, and the money the customers have paid since.
 */
export function byCampaign(
  cohort: readonly LeadFact[],
  names: ReadonlyMap<string, string>,
  wonValue: ReadonlyMap<string, number>,
  collected: ReadonlyMap<string, number>,
  quotedLeadIds: ReadonlySet<string>,
  estimatedLeadIds: ReadonlySet<string>,
  advancePaidLeadIds: ReadonlySet<string>,
  spendByCode: ReadonlyMap<string, number> = new Map(),
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
      advancePaid: 0,
      wonValuePaise: 0,
      collectedPaise: 0,
      spendPaise: 0,
      costPerLeadPaise: null,
      costPerSalePaise: null,
      returnOnSpend: null,
    };
    row.leads += 1;
    if (estimatedLeadIds.has(lead.id)) row.estimates += 1;
    if (quotedLeadIds.has(lead.id) || QUOTED_OR_LATER.has(lead.stage) || lead.wonAt)
      row.quoted += 1;
    if (lead.wonAt) {
      row.won += 1;
      row.wonValuePaise += wonValue.get(lead.id) ?? 0;
    }
    if (advancePaidLeadIds.has(lead.id)) row.advancePaid += 1;
    row.collectedPaise += collected.get(lead.id) ?? 0;
    rows.set(key, row);
  }
  // A campaign that spent in the period but brought no lead still shows: that is the news.
  for (const [code, spend] of spendByCode) {
    if (spend > 0 && !rows.has(code))
      rows.set(code, {
        key: code,
        label: names.get(code) ?? code,
        leads: 0,
        estimates: 0,
        quoted: 0,
        won: 0,
        advancePaid: 0,
        wonValuePaise: 0,
        collectedPaise: 0,
        spendPaise: 0,
        costPerLeadPaise: null,
        costPerSalePaise: null,
        returnOnSpend: null,
      });
  }
  return [...rows.values()]
    .map((row) => {
      const spendPaise = spendByCode.get(row.key) ?? 0;
      return {
        ...row,
        spendPaise,
        costPerLeadPaise: spendPaise > 0 ? costPer(spendPaise, row.leads) : null,
        costPerSalePaise: spendPaise > 0 ? costPer(spendPaise, row.won) : null,
        returnOnSpend: returnOnSpend(row.wonValuePaise, spendPaise),
      };
    })
    .sort(
      (a, b) => b.leads - a.leads || b.spendPaise - a.spendPaise || a.label.localeCompare(b.label),
    );
}
