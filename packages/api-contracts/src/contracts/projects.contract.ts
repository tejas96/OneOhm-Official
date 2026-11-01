import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { calendarDateSchema, idSchema, noteSchema, paiseSchema } from '../common/primitives';
import { commandCenterSchema } from '../schemas/dashboard.schema';
import {
  projectDetailSchema,
  projectSummarySchema,
  projectTaskSchema,
  waitingPartySchema,
} from '../schemas/project.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

export const projectsContract = c.router({
  createProject: {
    method: 'POST',
    path: '/projects',
    body: z.object({
      quotationId: idSchema,
      discomId: idSchema,
      loan: z.boolean().default(false),
      lenderName: z.string().trim().max(120).nullable().optional(),
      loanPaise: paiseSchema.min(0).default(0),
      battery: z.boolean().default(false),
      groundMount: z.boolean().default(false),
      nameChange: z.boolean().default(false),
      managerUserId: idSchema.nullable().optional(),
      startDate: calendarDateSchema,
    }),
    responses: {
      201: z.object({
        id: idSchema,
        code: z.string(),
        tasks: z.number().int(),
        unassigned: z.number().int(),
      }),
    },
    summary:
      'Creates the project from an accepted quotation, generates its tasks and payment milestones.',
  },
  listProjects: {
    method: 'GET',
    path: '/projects',
    responses: { 200: z.array(projectSummarySchema) },
  },
  getProject: {
    method: 'GET',
    path: '/projects/:id',
    pathParams: idParams,
    responses: { 200: projectDetailSchema },
  },
  recordPayment: {
    method: 'POST',
    path: '/projects/:id/payments',
    pathParams: idParams,
    body: z.object({
      milestoneId: idSchema,
      amountPaise: paiseSchema.positive(),
      method: z.enum(['cash', 'cheque', 'bank_transfer', 'upi', 'razorpay', 'bank_disbursement']),
      receivedOn: calendarDateSchema,
      reference: z.string().trim().max(120).nullable().optional(),
    }),
    responses: { 201: projectDetailSchema },
  },
  commandCenter: {
    method: 'GET',
    path: '/command-center',
    responses: { 200: commandCenterSchema },
  },
});

export const tasksContract = c.router({
  myTasks: { method: 'GET', path: '/tasks/mine', responses: { 200: z.array(projectTaskSchema) } },
  startTask: {
    method: 'POST',
    path: '/tasks/:id/start',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: projectTaskSchema },
  },
  markWaiting: {
    method: 'POST',
    path: '/tasks/:id/waiting',
    pathParams: idParams,
    body: z.object({ party: waitingPartySchema, note: noteSchema.nullable().optional() }),
    responses: { 200: projectTaskSchema },
  },
  completeTask: {
    method: 'POST',
    path: '/tasks/:id/complete',
    pathParams: idParams,
    body: z.object({
      facts: z.record(z.string(), z.string().trim().max(2000)).default({}),
      note: noteSchema.nullable().optional(),
    }),
    responses: { 200: projectTaskSchema },
    summary: 'Needs every fact the task captures; tasks needing approval go to review first.',
  },
  approveTask: {
    method: 'POST',
    path: '/tasks/:id/approve',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: projectTaskSchema },
  },
  assignTask: {
    method: 'POST',
    path: '/tasks/:id/assign',
    pathParams: idParams,
    body: z.object({ userId: idSchema.nullable() }),
    responses: { 200: projectTaskSchema },
  },
});
