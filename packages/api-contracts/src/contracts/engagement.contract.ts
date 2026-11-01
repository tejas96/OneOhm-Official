import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema, noteSchema } from '../common/primitives';
import {
  announcementInputSchema,
  announcementSchema,
  bonusInputSchema,
  bonusSchema,
  myRewardsSchema,
  teamCapacitySchema,
} from '../schemas/engagement.schema';
import { decisionStatusSchema } from '../schemas/workforce.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/**
 * Announcements, project bonuses and incentives, the team's workload, and each person's
 * own rewards (PRD 3.12, 4.1, 4.7).
 */
export const engagementContract = c.router({
  myAnnouncements: {
    method: 'GET',
    path: '/me/announcements',
    responses: { 200: z.array(announcementSchema) },
    summary: 'Announcements showing now for the signed-in person’s roles.',
  },
  listAnnouncements: {
    method: 'GET',
    path: '/announcements',
    responses: { 200: z.array(announcementSchema) },
  },
  createAnnouncement: {
    method: 'POST',
    path: '/announcements',
    body: announcementInputSchema,
    responses: { 201: announcementSchema },
    summary: 'Posts it and sends it once as an alert to the people it is for.',
  },
  endAnnouncement: {
    method: 'POST',
    path: '/announcements/:id/end',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: announcementSchema },
  },
  listBonuses: {
    method: 'GET',
    path: '/bonuses',
    query: z.object({ status: decisionStatusSchema.optional() }),
    responses: { 200: z.array(bonusSchema) },
  },
  proposeBonus: {
    method: 'POST',
    path: '/bonuses',
    body: bonusInputSchema,
    responses: { 201: bonusSchema },
  },
  decideBonus: {
    method: 'POST',
    path: '/bonuses/:id/decide',
    pathParams: idParams,
    body: z.object({ approve: z.boolean(), note: noteSchema.nullable().optional() }),
    responses: { 200: bonusSchema },
    summary: 'Approving makes each share a payable to that employee, booked in the ledger.',
  },
  cancelBonus: {
    method: 'POST',
    path: '/bonuses/:id/cancel',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: bonusSchema },
  },
  myRewards: {
    method: 'GET',
    path: '/me/rewards',
    responses: { 200: myRewardsSchema },
  },
  teamCapacity: {
    method: 'GET',
    path: '/team/capacity',
    responses: { 200: teamCapacitySchema },
  },
});
