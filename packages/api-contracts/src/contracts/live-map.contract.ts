import { initContract } from '@ts-rest/core';
import { liveSitesSchema, liveTeamSchema } from '../schemas/live-map.schema';

const c = initContract();

/**
 * The manager's live map (Duty Day step 4). HR (`people.manage`) sees every staff member with
 * location on; anyone else sees their direct reports. Someone with neither is refused (403).
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
});
