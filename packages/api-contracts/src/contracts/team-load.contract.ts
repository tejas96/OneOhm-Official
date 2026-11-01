import { initContract } from '@ts-rest/core';
import { commandCenterQuerySchema } from '../schemas/dashboard.schema';
import { teamLoadSchema } from '../schemas/team-load.schema';

const c = initContract();

/** The command centre's people view: work per person and per contractor crew. */
export const teamLoadContract = c.router({
  teamLoad: {
    method: 'GET',
    path: '/command-center/team',
    query: commandCenterQuerySchema,
    responses: { 200: teamLoadSchema },
  },
});
