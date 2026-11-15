import type { MarketingAlert } from '@oneohm/api-contracts';
import type { PlacementState } from '@oneohm/domain';

const DAY_MS = 24 * 3600 * 1000;
const NAME = { meta: 'Meta', google: 'Google' } as const;

export interface AlertConnection {
  readonly provider: 'meta' | 'google';
  readonly status: 'connected' | 'in_review' | 'needs_attention' | 'disconnected';
  readonly accountId: string | null;
  readonly tokenExpiresAt: Date | null;
  readonly balancePaise: number | null;
}

export interface AlertCampaign {
  readonly id: string;
  readonly name: string;
  readonly state: string;
  readonly placements: readonly { readonly state: PlacementState; readonly error: string | null }[];
  /** Spend per day over the last full days (paise), and the leads those days brought. */
  readonly spendByDay: ReadonlyMap<string, number>;
  readonly leadsInWindow: number;
}

export const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

/** Where the business adds money on each platform. */
export function topUpUrl(provider: 'meta' | 'google', accountId: string | null): string {
  if (provider === 'google') return 'https://ads.google.com/aw/billing/summary';
  const digits = (accountId ?? '').replace(/\D/g, '');
  return `https://business.facebook.com/billing_hub/accounts/details?asset_id=${digits}`;
}

export function connectionAlerts(
  connections: readonly AlertConnection[],
  lowBalancePaise: number,
  now: Date,
): MarketingAlert[] {
  const alerts: MarketingAlert[] = [];
  for (const connection of connections) {
    if (connection.status === 'disconnected') continue;
    const name = NAME[connection.provider];
    const expires = connection.tokenExpiresAt;
    const soon = expires !== null && expires.getTime() - now.getTime() <= 7 * DAY_MS;
    if (connection.status === 'needs_attention' || soon) {
      alerts.push({
        kind: 'reconnect',
        title: `Reconnect ${name}`,
        body:
          expires && expires.getTime() > now.getTime() && connection.status !== 'needs_attention'
            ? `${name} sign-in ends soon. Connect again so your ads keep running.`
            : `${name} needs you to sign in again. Your ads may stop until you do.`,
        href: '/marketing/connections',
        campaignId: null,
      });
    }
    if (connection.balancePaise !== null && connection.balancePaise < lowBalancePaise) {
      alerts.push({
        kind: 'low_balance',
        title: `${name} ad balance is low`,
        body: `${name} has ${rupees(connection.balancePaise)} left. Add money so your ads keep running.`,
        href: topUpUrl(connection.provider, connection.accountId),
        campaignId: null,
      });
    }
  }
  return alerts;
}

/** Live campaigns that spent money on each of `days` and brought no lead in them. */
export function noLeadAlerts(campaigns: readonly AlertCampaign[], days: readonly string[]) {
  const alerts: MarketingAlert[] = [];
  for (const campaign of campaigns) {
    if (campaign.state !== 'live' || days.length === 0) continue;
    const spends = days.map((day) => campaign.spendByDay.get(day) ?? 0);
    if (spends.some((paise) => paise <= 0) || campaign.leadsInWindow > 0) continue;
    const total = spends.reduce((sum, paise) => sum + paise, 0);
    alerts.push({
      kind: 'no_leads',
      title: 'No leads yet',
      body: `${campaign.name} spent ${rupees(total)} in ${days.length} days with no leads. Try a new photo or pause it.`,
      href: `/marketing/campaigns/${campaign.id}`,
      campaignId: campaign.id,
    });
  }
  return alerts;
}

/** A live campaign with a place that failed to start. */
export function failedPlaceAlerts(campaigns: readonly AlertCampaign[]): MarketingAlert[] {
  return campaigns.flatMap((campaign) => {
    const failed = campaign.placements.find((placement) => placement.state === 'failed');
    if (campaign.state !== 'live' || !failed) return [];
    return [
      {
        kind: 'needs_attention' as const,
        title: `${campaign.name} needs attention`,
        body: failed.error ?? 'One place did not start. Open the campaign to try again.',
        href: `/marketing/campaigns/${campaign.id}`,
        campaignId: campaign.id,
      },
    ];
  });
}

export function buildAlerts(input: {
  readonly now: Date;
  readonly lowBalancePaise: number;
  readonly connections: readonly AlertConnection[];
  readonly campaigns: readonly AlertCampaign[];
  readonly days: readonly string[];
}): MarketingAlert[] {
  return [
    ...connectionAlerts(input.connections, input.lowBalancePaise, input.now),
    ...failedPlaceAlerts(input.campaigns),
    ...noLeadAlerts(input.campaigns, input.days),
  ];
}
