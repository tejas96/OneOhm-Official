import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  leadCampaignCodeSchema,
  leadCampaignInputSchema,
  leadCampaignSchema,
  leadCampaignUpdateSchema,
} from '../schemas/lead-campaign.schema';

const c = initContract();

/** The owner's ad and campaign codes (Settings → Selling). */
export const leadCampaignsContract = c.router({
  listLeadCampaigns: {
    method: 'GET',
    path: '/lead-campaigns',
    responses: { 200: z.array(leadCampaignSchema) },
  },
  createLeadCampaign: {
    method: 'POST',
    path: '/lead-campaigns',
    body: leadCampaignInputSchema,
    responses: { 201: z.array(leadCampaignSchema) },
  },
  updateLeadCampaign: {
    method: 'PATCH',
    path: '/lead-campaigns/:code',
    pathParams: z.object({ code: leadCampaignCodeSchema }),
    body: leadCampaignUpdateSchema,
    responses: { 200: z.array(leadCampaignSchema) },
  },
});
