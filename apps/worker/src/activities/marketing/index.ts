import { todayIn } from '@oneohm/shared';
import { checkAdStatuses } from './ad-status';
import { syncAudiences } from './audiences';
import { checkBalances } from './balance';
import { findConversions } from './conversions-find';
import { sendConversions } from './conversions-send';
import type { MarketingDeps } from './deps';
import { publishDueCampaigns } from './due-campaigns';
import { lastWorked, markJobRun, readJob } from './job-store';
import { alertNoLeads } from './no-leads';
import { paced } from './paced';
import { isDue } from './pacing';
import { queueReviewRequests } from './review-requests';
import { readReviews } from './reviews';
import { pullSpend } from './spend';
import { checkTemplateApproval } from './template-approval';
import { alertTokenExpiry } from './token-expiry';

export type { MarketingDeps } from './deps';

/**
 * The marketing jobs, one Temporal activity each. They all run on the 15-minute tick, and each
 * keeps its own pace (every tick, hourly, or once a business day) in `marketing_jobs`.
 */
export function marketingActivities(deps: MarketingDeps) {
  const { db, config, timeZone } = deps;
  const job = (
    key: string,
    cadence: 'every' | 'hourly' | 'daily',
    run: Parameters<typeof paced>[4],
  ) => paced(db, timeZone, key, cadence, run);
  return {
    publishDueCampaigns: job('due_campaigns', 'every', (now) => publishDueCampaigns(deps, now)),
    findConversions: job('conversions_find', 'every', (now) => findConversions(db, now, timeZone)),
    sendConversions: job('conversions_send', 'every', (now) => sendConversions(db, config, now)),
    // Ads in review are checked every tick; live ones once an hour.
    checkAdStatuses: job('ad_status', 'every', async (now) => {
      const live = await readJob(db, 'ad_status_live');
      const withLive = isDue('hourly', lastWorked(live), now, timeZone);
      const done = await checkAdStatuses(deps, withLive);
      if (withLive && done !== null) await markJobRun(db, 'ad_status_live', null, now);
      return done;
    }),
    pullAdSpend: job('spend', 'hourly', (now) => pullSpend(deps, now)),
    checkAdBalances: job('balance', 'hourly', (now) =>
      checkBalances(deps, now, todayIn(timeZone, now)),
    ),
    alertNoLeads: job('no_leads', 'daily', (now) => alertNoLeads(deps, now)),
    alertTokenExpiry: job('token_expiry', 'daily', (now) => alertTokenExpiry(deps, now)),
    syncAudiences: job('audiences', 'daily', (now) => syncAudiences(deps, now)),
    queueReviewRequests: job('review_requests', 'hourly', (now) => queueReviewRequests(deps, now)),
    readGoogleReviews: job('reviews', 'hourly', (now) => readReviews(deps, now)),
    checkTemplateApproval: job('templates', 'hourly', () => checkTemplateApproval(deps)),
  };
}
