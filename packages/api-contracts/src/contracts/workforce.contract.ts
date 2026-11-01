import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, noteSchema } from '../common/primitives';
import {
  correctionSchema,
  decisionStatusSchema,
  leaveImpactSchema,
  leaveRequestSchema,
  myWorkdaySchema,
  positionSchema,
  teamAttendanceRowSchema,
} from '../schemas/workforce.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });
const decision = z.object({ approve: z.boolean(), note: noteSchema.nullable().optional() });
const leaveWindow = z
  .object({
    leaveType: z.string().trim().min(1),
    fromDate: calendarDateSchema,
    toDate: calendarDateSchema,
    halfDay: z.boolean().default(false),
  })
  .refine((body) => body.fromDate <= body.toDate, {
    message: 'The last day cannot be before the first.',
    path: ['toDate'],
  });

/** Attendance with consented location, and leave with handover (PRD 3.12, 4.3, 4.6). */
export const workforceContract = c.router({
  myWorkday: { method: 'GET', path: '/me/workday', responses: { 200: myWorkdaySchema } },
  setLocationConsent: {
    method: 'POST',
    path: '/attendance/consent',
    body: z.object({ given: z.boolean() }),
    responses: { 200: myWorkdaySchema },
  },
  checkIn: {
    method: 'POST',
    path: '/attendance/check-in',
    body: z.object({ position: positionSchema.nullable().optional() }),
    responses: { 200: myWorkdaySchema },
  },
  checkOut: {
    method: 'POST',
    path: '/attendance/check-out',
    body: z.object({ position: positionSchema.nullable().optional() }),
    responses: { 200: myWorkdaySchema },
  },
  requestCorrection: {
    method: 'POST',
    path: '/attendance/corrections',
    body: z.object({
      workDate: calendarDateSchema,
      checkInAt: instantSchema.nullable().optional(),
      checkOutAt: instantSchema.nullable().optional(),
      reason: z.string().trim().min(5, 'Say what happened.').max(500),
    }),
    responses: { 201: correctionSchema },
  },
  listCorrections: {
    method: 'GET',
    path: '/attendance/corrections',
    query: z.object({ status: decisionStatusSchema.optional() }),
    responses: { 200: z.array(correctionSchema) },
  },
  decideCorrection: {
    method: 'POST',
    path: '/attendance/corrections/:id/decide',
    pathParams: idParams,
    body: decision,
    responses: { 200: correctionSchema },
  },
  teamAttendance: {
    method: 'GET',
    path: '/attendance/team',
    query: z.object({ date: calendarDateSchema.optional() }),
    responses: { 200: z.array(teamAttendanceRowSchema) },
  },
  myLeave: { method: 'GET', path: '/leave/mine', responses: { 200: z.array(leaveRequestSchema) } },
  leaveImpact: {
    method: 'POST',
    path: '/leave/impact',
    body: leaveWindow,
    responses: { 200: leaveImpactSchema },
    summary: 'Days counted, balance left, tasks the leave touches and who could cover.',
  },
  applyLeave: {
    method: 'POST',
    path: '/leave',
    body: leaveWindow.and(
      z.object({
        reason: noteSchema.nullable().optional(),
        emergency: z.boolean().default(false),
        backupUserId: idSchema.nullable().optional(),
        handoverNote: noteSchema.nullable().optional(),
      }),
    ),
    responses: { 201: leaveRequestSchema },
  },
  cancelLeave: {
    method: 'POST',
    path: '/leave/:id/cancel',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: leaveRequestSchema },
  },
  listLeave: {
    method: 'GET',
    path: '/leave',
    query: z.object({ status: decisionStatusSchema.optional() }),
    responses: { 200: z.array(leaveRequestSchema) },
  },
  decideLeave: {
    method: 'POST',
    path: '/leave/:id/decide',
    pathParams: idParams,
    body: decision,
    responses: { 200: leaveRequestSchema },
    summary: 'Approving hands the open tasks in the window to the backup, if one was named.',
  },
});
