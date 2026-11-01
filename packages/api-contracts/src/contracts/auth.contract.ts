import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { phoneSchema } from '../common/primitives';
import { currentUserSchema } from '../schemas/identity.schema';

const c = initContract();

export const authContract = c.router({
  signIn: {
    method: 'POST',
    path: '/auth/sign-in',
    body: z.object({
      identifier: z.string().trim().min(1, 'Enter your email or employee ID.'),
      password: z.string().min(1, 'Enter your password.'),
    }),
    responses: { 200: z.object({ user: currentUserSchema }) },
    summary: 'Web sign-in with email or employee ID and password. Sets the session cookie.',
  },
  requestOtp: {
    method: 'POST',
    path: '/auth/otp',
    body: z.object({ phone: phoneSchema }),
    responses: { 202: z.object({ expiresInSeconds: z.number().int() }) },
    summary: 'Mobile sign-in: text a one-time code (MSG91).',
  },
  verifyOtp: {
    method: 'POST',
    path: '/auth/otp/verify',
    body: z.object({
      phone: phoneSchema,
      code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
    }),
    responses: { 200: z.object({ token: z.string(), user: currentUserSchema }) },
  },
  signOut: {
    method: 'POST',
    path: '/auth/sign-out',
    body: c.noBody(),
    responses: { 204: c.noBody() },
  },
  me: {
    method: 'GET',
    path: '/auth/me',
    responses: { 200: currentUserSchema },
  },
});
