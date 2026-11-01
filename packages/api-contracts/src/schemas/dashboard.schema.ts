import { z } from 'zod';
import { paiseSchema } from '../common/primitives';
import { projectSummarySchema, toneSchema } from './project.schema';

const waitingSchema = z.object({
  internal: z.number().int(),
  customer: z.number().int(),
  bank: z.number().int(),
  discom: z.number().int(),
});

export const actionItemSchema = z.object({
  id: z.string(),
  tone: toneSchema,
  title: z.string(),
  detail: z.string(),
  action: z.string(),
  party: z.enum(['internal', 'customer', 'bank', 'discom']),
  href: z.string(),
});
export type ActionItem = z.infer<typeof actionItemSchema>;

/** Everything the owner's command centre shows; every figure links to its records. */
export const commandCenterSchema = z.object({
  health: z.object({
    score: z.number().int(),
    delivery: z.number().int(),
    money: z.number().int(),
    team: z.number().int(),
  }),
  installed: z.object({
    wattsPeak: z.number().int(),
    commissioned: z.number().int(),
    dueThisWeek: z.number().int(),
    byType: z.object({
      residential: z.number().int(),
      society: z.number().int(),
      commercial: z.number().int(),
    }),
  }),
  collections: z.object({
    collectedPaise: paiseSchema,
    duePaise: paiseSchema,
    weekly: z.array(paiseSchema),
  }),
  actions: z.array(actionItemSchema),
  waitingDays: waitingSchema,
  pipeline: z.object({
    leads: z.number().int(),
    surveys: z.number().int(),
    quotations: z.number().int(),
    accepted: z.number().int(),
  }),
  projects: z.array(projectSummarySchema),
  money: z.object({
    collectedPaise: paiseSchema,
    stillDuePaise: paiseSchema,
    bankPendingPaise: paiseSchema,
    toVendorsPaise: paiseSchema,
    toContractorsPaise: paiseSchema,
    advancesPaise: paiseSchema,
  }),
  liveProjects: z.number().int(),
});
export type CommandCenter = z.infer<typeof commandCenterSchema>;
