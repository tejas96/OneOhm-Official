import { PROJECT_VARIANTS } from '@oneohm/domain';
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  approvalItemSchema,
  approvalPolicySchema,
  approvalPolicyViewSchema,
  assignmentRulesSchema,
  dashboardSettingsSchema,
  jobRunSchema,
  jobRunsSchema,
  projectVariantInputSchema,
  projectVariantSchema,
  reminderTimingSchema,
} from '../schemas/business-settings.schema';

const c = initContract();

/**
 * Business rules owners change without a developer (PRD 7.2), the record of automatic
 * jobs (PRD 7.1), and each person's "Waiting for my approval" list.
 */
export const businessSettingsContract = c.router({
  reminders: {
    method: 'GET',
    path: '/settings/reminders',
    responses: { 200: reminderTimingSchema },
  },
  saveReminders: {
    method: 'PUT',
    path: '/settings/reminders',
    body: reminderTimingSchema,
    responses: { 200: reminderTimingSchema },
  },
  assignment: {
    method: 'GET',
    path: '/settings/assignment',
    responses: { 200: assignmentRulesSchema },
  },
  saveAssignment: {
    method: 'PUT',
    path: '/settings/assignment',
    body: assignmentRulesSchema,
    responses: { 200: assignmentRulesSchema },
  },
  approvals: {
    method: 'GET',
    path: '/settings/approvals',
    responses: { 200: approvalPolicyViewSchema },
  },
  saveApprovals: {
    method: 'PUT',
    path: '/settings/approvals',
    body: approvalPolicySchema,
    responses: { 200: approvalPolicyViewSchema },
  },
  dashboard: {
    method: 'GET',
    path: '/settings/dashboard',
    responses: { 200: dashboardSettingsSchema },
  },
  saveDashboard: {
    method: 'PUT',
    path: '/settings/dashboard',
    body: dashboardSettingsSchema,
    responses: { 200: dashboardSettingsSchema },
  },
  projectVariants: {
    method: 'GET',
    path: '/settings/project-types',
    responses: { 200: z.array(projectVariantSchema) },
  },
  saveProjectVariant: {
    method: 'PUT',
    path: '/settings/project-types/:key',
    pathParams: z.object({ key: z.enum(PROJECT_VARIANTS) }),
    body: projectVariantInputSchema,
    responses: { 200: projectVariantSchema },
  },
  jobRuns: {
    method: 'GET',
    path: '/settings/job-runs',
    responses: { 200: jobRunsSchema },
  },
  retryJobRun: {
    method: 'POST',
    path: '/settings/job-runs/:id/retry',
    pathParams: z.object({ id: idSchema }),
    body: z.object({}).optional(),
    responses: { 202: jobRunSchema },
    summary: 'Queues the job to run again; the worker picks it up within a minute.',
  },
  myApprovals: {
    method: 'GET',
    path: '/approvals/mine',
    responses: { 200: z.array(approvalItemSchema) },
  },
});
