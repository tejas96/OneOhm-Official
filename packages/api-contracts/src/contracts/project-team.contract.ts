import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import { projectDetailSchema, projectTaskSchema } from '../schemas/project.schema';
import {
  escalationPolicySchema,
  projectUpdateSchema,
  teamOptionsSchema,
} from '../schemas/project-team.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/**
 * A project's team after creation (PRD 3.8, 3.4, 3.7): who can be picked, a new manager
 * or team, confirming critical assignments, rechecking the survey price, the survey
 * report, and when late work is raised.
 */
export const projectTeamContract = c.router({
  teamOptions: {
    method: 'GET',
    path: '/project-team/options',
    responses: { 200: teamOptionsSchema },
    summary: 'Active staff and contractors who can be put on a project.',
  },
  updateProject: {
    method: 'PATCH',
    path: '/projects/:id',
    pathParams: idParams,
    body: projectUpdateSchema,
    responses: { 200: projectDetailSchema },
    summary: 'Changes the manager, named team or target finish; the new manager is told.',
  },
  recheckBudget: {
    method: 'POST',
    path: '/projects/:id/budget-check',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: projectDetailSchema },
    summary: 'Runs the survey price check again when it could not run after approval.',
  },
  confirmAssignee: {
    method: 'POST',
    path: '/tasks/:id/confirm-assignee',
    pathParams: idParams,
    body: z.object({ userId: idSchema }),
    responses: { 200: projectTaskSchema },
    summary: 'A manager confirms or changes who does a critical task.',
  },
  surveyReportPdf: {
    method: 'GET',
    path: '/projects/:id/survey-report/pdf',
    pathParams: idParams,
    responses: { 200: c.otherResponse({ contentType: 'application/pdf', body: c.type<Blob>() }) },
    summary: 'The site survey report: facts, checklist, geotagged photos and notes.',
  },
  escalationPolicy: {
    method: 'GET',
    path: '/settings/escalation',
    responses: { 200: escalationPolicySchema },
  },
  updateEscalationPolicy: {
    method: 'PUT',
    path: '/settings/escalation',
    body: escalationPolicySchema,
    responses: { 200: escalationPolicySchema },
  },
});
