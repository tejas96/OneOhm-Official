import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  assignSiteSchema,
  dutyAlertSchema,
  liveAlertsSchema,
  nearestPeopleSchema,
  resolveAlertSchema,
} from '../schemas/live-alerts.schema';
import { liveSiteSchema, liveSitesSchema, liveTeamSchema } from '../schemas/live-map.schema';

const c = initContract();

/**
 * The manager's live map (Duty Day steps 4 and 5). HR (`people.manage`) sees every staff
 * member; anyone else sees their direct reports. Someone with neither is refused (403) on
 * every route here. Alerts, nearest people and assignment stay inside that same scope: an
 * alert or person outside it is not found (404).
 */
export const liveMapContract = c.router({
  liveTeam: {
    method: 'GET',
    path: '/live/team',
    responses: { 200: liveTeamSchema },
    summary: 'Everyone the caller looks after, today: state, last position, tail, km and visits.',
  },
  liveSites: {
    method: 'GET',
    path: '/live/sites',
    responses: { 200: liveSitesSchema },
    summary: 'Today’s customer sites for those people, with status, and the offices.',
  },
  liveAlerts: {
    method: 'GET',
    path: '/live/alerts',
    responses: { 200: liveAlertsSchema },
    summary: 'Open duty alerts about those people, newest first, with person and subject labels.',
  },
  seeAlert: {
    method: 'POST',
    path: '/live/alerts/:id/seen',
    pathParams: z.object({ id: idSchema }),
    body: z.object({}).optional(),
    responses: { 200: dutyAlertSchema },
    summary: 'Marks an alert seen by the caller; it stays open. Seen twice keeps the first.',
  },
  resolveAlert: {
    method: 'POST',
    path: '/live/alerts/:id/resolve',
    pathParams: z.object({ id: idSchema }),
    body: resolveAlertSchema,
    responses: { 200: dutyAlertSchema },
    summary: 'Closes an alert, with an optional reason; it leaves the feed.',
  },
  nearestToSite: {
    method: 'GET',
    path: '/live/sites/:id/nearest',
    pathParams: z.object({ id: idSchema }),
    responses: { 200: nearestPeopleSchema },
    summary: 'Send nearest: up to 5 free people on duty, nearest first, with an "about" ETA.',
  },
  assignSite: {
    method: 'POST',
    path: '/live/sites/:id/assign',
    pathParams: z.object({ id: idSchema }),
    body: assignSiteSchema,
    responses: { 200: liveSiteSchema },
    summary:
      'Gives the site’s task or service request to the person, as the usual assignment does (same rights, history and notice to the worker; the customer is not messaged).',
  },
});
