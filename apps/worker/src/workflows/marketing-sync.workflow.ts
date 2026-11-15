import { proxyActivities } from '@temporalio/workflow';
import type { Activities } from '../activities';

const jobs = proxyActivities<Activities>({
  startToCloseTimeout: '5 minutes',
  retry: { initialInterval: '30 seconds', maximumAttempts: 2 },
});

/** Runs one job; a job that still fails after its retries never stops the ones after it. */
async function settle(job: () => Promise<number>): Promise<number | null> {
  try {
    return await job();
  } catch {
    return null;
  }
}

/**
 * Every 15 minutes: posts that are due, sale steps told to Meta and Google, ad reviews, and
 * (each at its own pace, kept in `marketing_jobs`) spend, ad balance, lists, reviews and
 * template approval.
 */
export async function marketingSyncWorkflow(): Promise<Record<string, number | null>> {
  return {
    dueCampaigns: await settle(jobs.publishDueCampaigns),
    conversionsFound: await settle(jobs.findConversions),
    conversionsSent: await settle(jobs.sendConversions),
    adStatus: await settle(jobs.checkAdStatuses),
    spend: await settle(jobs.pullAdSpend),
    balance: await settle(jobs.checkAdBalances),
    noLeads: await settle(jobs.alertNoLeads),
    tokenExpiry: await settle(jobs.alertTokenExpiry),
    audiences: await settle(jobs.syncAudiences),
    reviewRequests: await settle(jobs.queueReviewRequests),
    reviews: await settle(jobs.readGoogleReviews),
    templates: await settle(jobs.checkTemplateApproval),
  };
}
