import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  campaignDetailSchema,
  marketingMediaSchema,
  marketingOverviewSchema,
  newCampaignInputSchema,
  waitingAdLeadsSchema,
} from '../schemas/marketing.schema';
import {
  campaignDefaultsSchema,
  marketingConnectionsSchema,
  marketingSettingsSchema,
  placeChoiceSchema,
} from '../schemas/marketing-connections.schema';

const c = initContract();
const providerParam = z.object({ provider: z.enum(['meta', 'google']) });
const campaignParam = z.object({ id: idSchema });

/**
 * Marketing (spec 2026-11-15): campaigns on Meta, Google and WhatsApp, the connections, and the
 * numbers. Needs `marketing.manage`, except the waiting ad leads (anyone who works on leads).
 */
export const marketingContract = c.router({
  overview: {
    method: 'GET',
    path: '/marketing',
    responses: { 200: marketingOverviewSchema },
    summary: 'Every campaign card, alerts, reviews and the last 30 days.',
  },
  defaults: {
    method: 'GET',
    path: '/marketing/defaults',
    responses: { 200: campaignDefaultsSchema },
    summary: 'What the New campaign screen starts with: last city and budget, ready places.',
  },
  uploadMedia: {
    method: 'POST',
    path: '/marketing/media',
    contentType: 'multipart/form-data',
    body: c.type<FormData>(),
    responses: { 201: marketingMediaSchema },
    summary: 'One photo (JPEG, PNG, WebP) or video (MP4, MOV) for a campaign.',
  },
  launch: {
    method: 'POST',
    path: '/marketing/campaigns',
    body: newCampaignInputSchema,
    responses: { 201: campaignDetailSchema },
    summary: 'Makes the campaign and starts it on every place picked; each place has its result.',
  },
  campaign: {
    method: 'GET',
    path: '/marketing/campaigns/:id',
    pathParams: campaignParam,
    responses: { 200: campaignDetailSchema },
  },
  pause: {
    method: 'POST',
    path: '/marketing/campaigns/:id/pause',
    pathParams: campaignParam,
    body: z.object({}),
    responses: { 200: campaignDetailSchema },
  },
  stop: {
    method: 'POST',
    path: '/marketing/campaigns/:id/stop',
    pathParams: campaignParam,
    body: z.object({}),
    responses: { 200: campaignDetailSchema },
  },
  runAgain: {
    method: 'POST',
    path: '/marketing/campaigns/:id/run-again',
    pathParams: campaignParam,
    body: z.object({}),
    responses: { 200: campaignDetailSchema },
    summary:
      'Resumes a paused campaign, retries a failed one, or copies a stopped one and starts it.',
  },
  connections: {
    method: 'GET',
    path: '/marketing/connections',
    responses: { 200: marketingConnectionsSchema },
  },
  connectStart: {
    method: 'POST',
    path: '/marketing/connections/:provider/start',
    pathParams: providerParam,
    body: z.object({}),
    responses: { 200: z.object({ url: z.string() }) },
    summary: 'The Meta or Google sign-in page to open; it comes back to Marketing → Connections.',
  },
  choose: {
    method: 'POST',
    path: '/marketing/connections/:provider/choose',
    pathParams: providerParam,
    body: z.object({ accountId: z.string().min(1), pageId: z.string().min(1).optional() }),
    responses: { 200: marketingConnectionsSchema },
    summary: 'Picks the ad account (and Meta page) when the sign-in sees several.',
  },
  disconnect: {
    method: 'POST',
    path: '/marketing/connections/:provider/disconnect',
    pathParams: providerParam,
    body: z.object({}),
    responses: { 200: marketingConnectionsSchema },
  },
  saveSettings: {
    method: 'PUT',
    path: '/marketing/settings',
    body: marketingSettingsSchema,
    responses: { 200: marketingConnectionsSchema },
  },
  findPlace: {
    method: 'GET',
    path: '/marketing/place-search',
    query: z.object({ q: z.string().trim().max(200).optional() }),
    responses: { 200: z.array(placeChoiceSchema) },
    summary: 'The business on Google Maps (from the company profile when `q` is empty).',
  },
  submitTemplate: {
    method: 'POST',
    path: '/marketing/templates/:key/submit',
    pathParams: z.object({ key: z.string().min(1) }),
    body: z.object({}),
    responses: { 200: marketingConnectionsSchema },
    summary: 'Sends a WhatsApp marketing message to Meta for approval.',
  },
  reviewsSeen: {
    method: 'POST',
    path: '/marketing/reviews/seen',
    body: z.object({}),
    responses: { 204: c.noBody() },
  },
  waitingLeads: {
    method: 'GET',
    path: '/marketing/waiting-leads',
    responses: { 200: waitingAdLeadsSchema },
    summary: "Ad leads still waiting for their first call (the owner's own, or all for managers).",
  },
});
