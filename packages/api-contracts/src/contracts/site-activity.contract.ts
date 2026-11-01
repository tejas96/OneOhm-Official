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
  saveSiteLocation: {
    method: 'POST',
    path: '/tasks/:id/site/location',
    pathParams: idParams,
    body: z.object({}).optional(),
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
    body: z.object({ workDate: calendarDateSchema, note: noteSchema.nullable().optional() }),
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
  decideTravelClaim: {
    method: 'POST',
    path: '/travel-claims/:id/decide',
    pathParams: idParams,
    body: z.object({ approve: z.boolean(), note: noteSchema.nullable().optional() }),
    responses: { 200: travelClaimSchema },
  },
});
