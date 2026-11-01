import { initContract } from '@ts-rest/core';
import { commandCenterQuerySchema } from '../schemas/dashboard.schema';
import { taskBoardQuerySchema, taskBoardSchema } from '../schemas/task-board.schema';
import { teamLoadSchema } from '../schemas/team-load.schema';

const c = initContract();

/** The command centre's people view (work per person and crew) and its task drill-down. */
export const teamLoadContract = c.router({
  teamLoad: {
    method: 'GET',
    path: '/command-center/team',
    query: commandCenterQuerySchema,
    responses: { 200: teamLoadSchema },
  },
  /** Open, overdue, unowned, waiting, finished or late tasks across projects, filtered. */
  taskBoard: {
    method: 'GET',
    path: '/command-center/tasks',
    query: taskBoardQuerySchema,
    responses: { 200: taskBoardSchema },
  },
});
