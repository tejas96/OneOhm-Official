import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { inboxSchema, markReadSchema, pushDeviceSchema } from '../schemas/notification.schema';

const c = initContract();
const forget = z.object({ token: z.string().trim().min(10).max(300) });

/**
 * Alerts for staff (session) and customers (customer bearer token): the inbox, marking
 * as read, and the phones that receive push alerts (PRD 3.7, 5.1).
 */
export const notificationsContract = c.router({
  inbox: {
    method: 'GET',
    path: '/me/notifications',
    responses: { 200: inboxSchema },
  },
  markRead: {
    method: 'POST',
    path: '/me/notifications/read',
    body: markReadSchema,
    responses: { 204: c.noBody() },
  },
  addDevice: {
    method: 'POST',
    path: '/me/push-devices',
    body: pushDeviceSchema,
    responses: { 204: c.noBody() },
  },
  forgetDevice: {
    method: 'POST',
    path: '/me/push-devices/forget',
    body: forget,
    responses: { 204: c.noBody() },
  },
  customerInbox: {
    method: 'GET',
    path: '/customer/notifications',
    responses: { 200: inboxSchema },
  },
  customerMarkRead: {
    method: 'POST',
    path: '/customer/notifications/read',
    body: markReadSchema,
    responses: { 204: c.noBody() },
  },
  customerAddDevice: {
    method: 'POST',
    path: '/customer/push-devices',
    body: pushDeviceSchema,
    responses: { 204: c.noBody() },
  },
  customerForgetDevice: {
    method: 'POST',
    path: '/customer/push-devices/forget',
    body: forget,
    responses: { 204: c.noBody() },
  },
});
