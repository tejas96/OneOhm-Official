import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { calendarDateSchema, idSchema, noteSchema } from '../common/primitives';
import {
  siteVisitSchema,
  taskSiteSchema,
  travelClaimSchema,
  travelDaySchema,
} from '../schemas/site-activity.schema';
import { decisionStatusSchema, positionSchema } from '../schemas/workforce.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });
const reading = z.object({ position: positionSchema.nullable().optional() });

/**
 * Site check-in and check-out on a task, the day's travel between sites, and travel
 * claims approved like leave and paid by finance (PRD 4.2, 4.3).
 */
export const siteActivityContract = c.router({
  taskSite: {
    method: 'GET',
    path: '/tasks/:id/site',
    pathParams: idParams,
    responses: { 200: taskSiteSchema },
  },
  siteCheckIn: {
    method: 'POST',
    path: '/tasks/:id/site/check-in',
    pathParams: idParams,
    body: reading,
    responses: { 200: taskSiteSchema },
  },
  siteCheckOut: {
    method: 'POST',
    path: '/tasks/:id/site/check-out',
    pathParams: idParams,
    body: reading,
    responses: { 200: taskSiteSchema },
  },
  /** The person ends their own open visit by its id: works after a hand-over or a deleted task. */
  closeSiteVisit: {
    method: 'POST',
    path: '/site-visits/:id/check-out',
    pathParams: idParams,
    body: reading,
    responses: { 200: siteVisitSchema },
  },
  /** A manager ends someone's stuck visit, with the reason on record. */
  forceCloseSiteVisit: {
    method: 'POST',
    path: '/site-visits/:id/force-close',
    pathParams: idParams,
    body: z.object({ reason: z.string().trim().min(3, 'Say why it is being closed.').max(500) }),
    responses: { 200: siteVisitSchema },
  },
  saveSiteLocation: {
    method: 'POST',
    path: '/tasks/:id/site/location',
    pathParams: idParams,
    /** With a pin: the roof the worker pinned on the map. Without: their check-in reading. */
    body: z
      .object({ pin: positionSchema.pick({ latitude: true, longitude: true }).optional() })
      .optional(),
    responses: { 200: taskSiteSchema },
  },
  projectSiteVisits: {
    method: 'GET',
    path: '/projects/:id/site-visits',
    pathParams: idParams,
    responses: { 200: z.array(siteVisitSchema) },
  },
  myTravel: {
    method: 'GET',
    path: '/me/travel',
    query: z.object({ date: calendarDateSchema.optional() }),
    responses: { 200: travelDaySchema },
  },
  myTravelClaims: {
    method: 'GET',
    path: '/me/travel-claims',
    responses: { 200: z.array(travelClaimSchema) },
  },
  claimTravel: {
    method: 'POST',
    path: '/me/travel-claims',
    body: z.object({
      workDate: calendarDateSchema,
      note: noteSchema.nullable().optional(),
      /** One of the projects visited that day, so the travel counts in its cost. */
      projectId: idSchema.nullable().optional(),
    }),
    responses: { 201: travelClaimSchema },
  },
  cancelTravelClaim: {
    method: 'POST',
    path: '/me/travel-claims/:id/cancel',
    pathParams: idParams,
    body: z.object({}).optional(),
    responses: { 200: travelClaimSchema },
  },
  listTravelClaims: {
    method: 'GET',
    path: '/travel-claims',
    query: z.object({
      status: decisionStatusSchema.optional(),
      userId: idSchema.optional(),
      from: calendarDateSchema.optional(),
      to: calendarDateSchema.optional(),
    }),
    responses: { 200: z.array(travelClaimSchema) },
  },
  travelClaimDay: {
    method: 'GET',
    path: '/travel-claims/:id/day',
    pathParams: idParams,
    responses: { 200: travelDaySchema },
  },
  voidTravelClaim: {
    method: 'POST',
    path: '/travel-claims/:id/void',
    pathParams: idParams,
    body: z.object({ reason: noteSchema.min(2, 'Say why.') }),
    responses: { 200: travelClaimSchema },
    summary:
      'Voids an approved claim that is not paid: cancels the bill and reverses its ledger entry.',
  },
  decideTravelClaim: {
    method: 'POST',
    path: '/travel-claims/:id/decide',
    pathParams: idParams,
    body: z.object({
      approve: z.boolean(),
      note: noteSchema.nullable().optional(),
      /** The amount the approver saw; if the claim changed since, the decision is refused (409 `amount_changed`). */
      expectedAmountPaise: z.number().int().min(0).optional(),
    }),
    responses: { 200: travelClaimSchema },
  },
});
