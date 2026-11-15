import type { CampaignNumbers } from '@oneohm/api-contracts';
import { costPer } from '@oneohm/domain';

/** What was counted for one campaign, before the cost per lead and per sale are worked out. */
export interface RawNumbers {
  readonly spentPaise: number;
  readonly leads: number;
  readonly sales: number;
  readonly salesValuePaise: number;
  readonly messagesSent: number;
  readonly messagesRead: number;
}

export const NO_NUMBERS: RawNumbers = {
  spentPaise: 0,
  leads: 0,
  sales: 0,
  salesValuePaise: 0,
  messagesSent: 0,
  messagesRead: 0,
};

/** The card's numbers: costs are null until there is something to divide by. */
export function numbersOf(raw: RawNumbers): CampaignNumbers {
  return {
    ...raw,
    costPerLeadPaise: costPer(raw.spentPaise, raw.leads),
    costPerSalePaise: costPer(raw.spentPaise, raw.sales),
  };
}

/**
 * The value of won leads: for each accepted quotation chain (all revisions share the number)
 * the latest accepted revision counts once, as the sales report does.
 */
export function wonValueByLead(
  rows: readonly {
    readonly leadId: string | null;
    readonly number: string;
    readonly revision: number;
    readonly totalPaise: number;
  }[],
): Map<string, number> {
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const current = latest.get(row.number);
    if (!current || row.revision > current.revision) latest.set(row.number, row);
  }
  const byLead = new Map<string, number>();
  for (const row of latest.values()) {
    if (row.leadId) byLead.set(row.leadId, (byLead.get(row.leadId) ?? 0) + row.totalPaise);
  }
  return byLead;
}
