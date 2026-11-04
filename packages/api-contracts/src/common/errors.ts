import { z } from 'zod';

/** Every error answer: a sentence for people, an optional code, and field-level messages. */
export const errorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  fieldErrors: z.record(z.string(), z.string()).optional(),
  /** Facts for a next step, like `{ userId, fullName, leftOn }` for a number a past member held. */
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ApiErrorBody = z.infer<typeof errorSchema>;

export const commonErrorResponses = {
  400: errorSchema,
  401: errorSchema,
  403: errorSchema,
  404: errorSchema,
  409: errorSchema,
} as const;
