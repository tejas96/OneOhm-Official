import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { calendarDateSchema, idSchema, noteSchema, paiseSchema } from '../common/primitives';
import { commandCenterQuerySchema, commandCenterSchema } from '../schemas/dashboard.schema';
import {
  projectDetailSchema,
  projectSummarySchema,
  projectTaskSchema,
  waitingPartySchema,
} from '../schemas/project.schema';
import { taskFlowRoutes } from './task-flow.routes';

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
      /** The lender from the list; its disbursement pattern plans the bank's tranches. */
      lendingPartnerId: idSchema.nullable().optional(),
      loanPaise: paiseSchema.min(0).default(0),
      battery: z.boolean().default(false),
      groundMount: z.boolean().default(false),
      nameChange: z.boolean().default(false),
      managerUserId: idSchema.nullable().optional(),
      /** Payment terms for this deal; the default plan when left out. */
      paymentPlanId: idSchema.nullable().optional(),
      startDate: calendarDateSchema,
      /** When the owner wants it finished (optional, PRD 3.8). */
      targetFinishDate: calendarDateSchema.nullable().optional(),
      /** The one crew company for crew work; left out, the engine picks one. */
      contractorId: idSchema.nullable().optional(),
      /** Staff named for the project; its in-house tasks go to them first. */
      teamUserIds: z.array(idSchema).max(30).default([]),
    }),
    responses: {
      201: z.object({
        id: idSchema,
        code: z.string(),
        tasks: z.number().int(),
        unassigned: z.number().int(),
        /** Critical tasks with a proposed person for a manager to confirm. */
        toConfirm: z.number().int(),
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
      /** The money that arrived. */
      amountPaise: paiseSchema.positive(),
      /** TDS a business customer deducted: settles the milestone with the money. */
      tdsPaise: paiseSchema.nonnegative().optional(),
      method: z.enum(['cash', 'cheque', 'bank_transfer', 'upi', 'razorpay', 'bank_disbursement']),
      receivedOn: calendarDateSchema,
      reference: z.string().trim().max(120).nullable().optional(),
      /** Cash or cheque: who holds it until it is deposited (defaults to the recorder). */
      collectedByUserId: idSchema.nullable().optional(),
      chequeNumber: z.string().trim().max(20).nullable().optional(),
      chequeBank: z.string().trim().max(80).nullable().optional(),
      chequeDate: calendarDateSchema.nullable().optional(),
    }),
    responses: { 201: projectDetailSchema },
  },
  commandCenter: {
    method: 'GET',
    path: '/command-center',
    query: commandCenterQuerySchema,
    responses: { 200: commandCenterSchema },
  },
});

export const tasksContract = c.router({
  myTasks: { method: 'GET', path: '/tasks/mine', responses: { 200: z.array(projectTaskSchema) } },
  getTask: {
    method: 'GET',
    path: '/tasks/:id',
    pathParams: idParams,
    responses: { 200: projectTaskSchema },
    summary: 'One task for its assignee, approvers and people who see every project.',
  },
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
      /** A manager's reason to hand over before the material is reconciled (PRD 3.17). */
      materialOverride: z.string().trim().max(500).nullable().optional(),
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
  ...taskFlowRoutes,
});
