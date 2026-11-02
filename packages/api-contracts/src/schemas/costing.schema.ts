import {
  ACCESS_LEVELS,
  CABLE_ROUTES,
  type CostingCard,
  cardProblems,
  PRICING_MODES,
  QUANTITY_PER,
  RATE_KINDS,
  STRUCTURE_TYPES,
} from '@oneohm/domain';
import { z } from 'zod';
import { idSchema, paiseSchema, unitSchema } from '../common/primitives';

const amountSchema = z.number().int().nonnegative('Use zero or more.').max(10_00_00_000);
/** Basis points: 100 = 1%. */
const basisPointsSchema = z.number().int().min(0).max(10_000, 'Use at most 100%.');
const metresSchema = z.number().min(0, 'Use zero or more.').max(2_000);
const countSchema = z.number().min(0, 'Use zero or more.').max(10_000);
const rateKeySchema = z.string().trim().min(2).max(40);

export const rateLineSchema = z.object({
  key: rateKeySchema,
  label: z.string().trim().min(2, 'Name the rate.').max(120),
  kind: z.enum(RATE_KINDS),
  unit: unitSchema,
  pricePaise: amountSchema,
  costPaise: amountSchema,
  tax: z.enum(['goods', 'service']),
  productId: idSchema.nullable(),
  /** Filled from the linked product when priced; never typed. */
  taxRateBp: basisPointsSchema.optional(),
});

const rateItemSchema = z.object({
  rate: rateKeySchema,
  per: z.enum(QUANTITY_PER),
  qty: countSchema,
});

export const structurePartSchema = rateItemSchema.extend({ perHeightM: z.boolean().optional() });

export const cableRouteSchema = z.object({
  kind: z.enum(CABLE_ROUTES),
  cable: rateKeySchema,
  routing: rateKeySchema.nullable(),
  acrossM: metresSchema,
  upPerFloorM: metresSchema,
  runs: z.number().int().min(1, 'Use at least 1.').max(100),
});

export const crewMemberSchema = z.object({
  rate: rateKeySchema,
  workers: z.number().int().min(1, 'Use at least 1.').max(50),
});

const equipmentRuleSchema = z.object({
  rate: rateKeySchema,
  qty: countSchema,
  fromFloor: z.number().int().min(0).max(40),
});

export const siteSetupSchema = z.object({
  label: z.string().trim().min(2, 'Name the structure.').max(120),
  perKw: z.object({ pricePaise: amountSchema, costPaise: amountSchema }),
  heightM: z.number().min(0).max(20),
  tiltDeg: z.number().min(0).max(60),
  panelsPerRow: z.number().int().min(1, 'Use at least 1.').max(100),
  parts: z.array(structurePartSchema).max(30),
  routes: z.array(cableRouteSchema).max(12),
  crew: z.array(crewMemberSchema).max(10),
  kwPerDay: z.number().min(0).max(1_000),
  minDays: z.number().min(0).max(60),
  equipment: z.array(equipmentRuleSchema).max(10),
});

const sitesShape = Object.fromEntries(STRUCTURE_TYPES.map((type) => [type, siteSetupSchema])) as {
  [K in (typeof STRUCTURE_TYPES)[number]]: typeof siteSetupSchema;
};

/** The costing card (PRD 3.9): rate lines, site-type defaults and pricing rules. */
export const costingCardSchema = z
  .object({
    version: z.literal(2),
    rateLines: z.array(rateLineSchema).max(200),
    sites: z.object(sitesShape),
    jobItems: z.array(rateItemSchema).max(30),
    extraFloor: z.object({
      rate: rateKeySchema.nullable(),
      freeFloors: z.number().int().min(0).max(40),
    }),
    travel: z.object({
      label: z.string().trim().min(2).max(120),
      flatPaise: amountSchema,
      baseKm: z.number().int().min(0).max(2_000),
      perKmPaise: amountSchema,
      roadFactorBp: z
        .number()
        .int()
        .min(10_000, 'Use at least 1 ×.')
        .max(30_000, 'Use at most 3 ×.'),
      visits: z.number().int().min(0).max(30),
    }),
    accessBp: z.object(
      Object.fromEntries(ACCESS_LEVELS.map((level) => [level, basisPointsSchema])) as {
        [K in (typeof ACCESS_LEVELS)[number]]: typeof basisPointsSchema;
      },
    ),
    wastageBp: z.number().int().min(0).max(5_000, 'Use at most 50%.'),
    overheadBp: z.number().int().min(0).max(5_000, 'Use at most 50%.'),
    pricing: z.object({ mode: z.enum(PRICING_MODES), marginBp: basisPointsSchema }),
    goodsTaxBp: basisPointsSchema,
    serviceTaxBp: basisPointsSchema,
    contingencyBp: basisPointsSchema,
    toleranceBp: basisPointsSchema,
    discountApprovalBp: basisPointsSchema.optional(),
    sqmPerKwp: z.number().min(0).max(50).optional(),
  })
  .superRefine((card, context) => {
    for (const problem of cardProblems(card as CostingCard)) {
      context.addIssue({ code: 'custom', path: [...problem.path], message: problem.message });
    }
  });
export type CostingCardValues = z.infer<typeof costingCardSchema>;

export const cableRunInputSchema = z.object({
  kind: z.enum(CABLE_ROUTES),
  cable: rateKeySchema.optional(),
  routing: rateKeySchema.nullable().optional(),
  floor: z.number().int().min(0).max(40).nullable().optional(),
  acrossM: metresSchema,
  upM: metresSchema,
  runs: z.number().int().min(1, 'Use at least 1.').max(100),
});
export type CableRunInputValues = z.infer<typeof cableRunInputSchema>;

/**
 * What a quotation says beyond the quick quote (PRD 3.9): measured cable runs, the
 * structure as built, crew, days, visits, site access and equipment. Anything left out
 * comes from the site type's defaults.
 */
export const costingDetailSchema = z.object({
  inverterLocation: z.string().trim().max(120).optional(),
  arrayLocation: z.string().trim().max(120).optional(),
  runs: z.array(cableRunInputSchema).max(30).optional(),
  structure: z
    .object({
      heightM: z.number().min(0).max(20).optional(),
      tiltDeg: z.number().min(0).max(60).optional(),
      panelsPerRow: z.number().int().min(1).max(100).optional(),
      parts: z.array(structurePartSchema).max(30).optional(),
    })
    .optional(),
  crew: z.array(crewMemberSchema).max(10).optional(),
  days: z.number().positive('Use more than zero.').max(120).optional(),
  visits: z.number().int().min(0).max(30).optional(),
  access: z.enum(ACCESS_LEVELS).optional(),
  equipment: z
    .array(z.object({ rate: rateKeySchema, qty: countSchema }))
    .max(10)
    .optional(),
});
export type CostingDetailInput = z.infer<typeof costingDetailSchema>;

const pricedRunSchema = z.object({
  kind: z.enum(CABLE_ROUTES),
  cable: z.string(),
  routing: z.string().nullable(),
  floor: z.number().nullable(),
  acrossM: z.number(),
  upM: z.number(),
  runs: z.number(),
  cableM: z.number(),
  routeM: z.number(),
  basis: z.enum(['catalog', 'default', 'survey']),
});

/** What the engine used for one quotation, so a manager can see and change any of it. */
export const usedDetailSchema = z.object({
  runs: z.array(pricedRunSchema),
  structure: z.object({
    heightM: z.number(),
    tiltDeg: z.number(),
    panelsPerRow: z.number(),
    rows: z.number(),
    parts: z.array(structurePartSchema),
    perKw: z.boolean(),
  }),
  crew: z.array(crewMemberSchema),
  days: z.number(),
  visits: z.number(),
  access: z.enum(ACCESS_LEVELS),
  equipment: z.array(z.object({ rate: z.string(), qty: z.number() })),
  tripPaise: paiseSchema,
});
export type UsedDetailView = z.infer<typeof usedDetailSchema>;

/** Material + labour + equipment + travel + services → cost; overhead; margin (PRD 3.9 D). */
export const costBuildupSchema = z.object({
  materialPaise: paiseSchema,
  labourPaise: paiseSchema,
  equipmentPaise: paiseSchema,
  travelPaise: paiseSchema,
  servicesPaise: paiseSchema,
  directCostPaise: paiseSchema,
  overheadPaise: paiseSchema,
  fullCostPaise: paiseSchema,
  netPricePaise: paiseSchema,
  marginPaise: paiseSchema,
  marginBp: z.number().int(),
});
export type CostBuildupView = z.infer<typeof costBuildupSchema>;

/** How a quotation's price was reached, with the rate lines it named (labels and units). */
export const quotationCostingSchema = z.object({
  build: costBuildupSchema.optional(),
  used: usedDetailSchema.optional(),
  rates: z.array(rateLineSchema.pick({ key: true, label: true, kind: true, unit: true })),
  /** Rates sales may pick in the detail: cables, routing, structure parts, labour, equipment. */
  pricingMode: z.enum(PRICING_MODES),
});
export type QuotationCosting = z.infer<typeof quotationCostingSchema>;

/** The road distance from base to a site, worked out from GPS (PRD 3.9 B). */
export const siteDistanceSchema = z.object({
  distanceKm: z.number().int().nullable(),
  /** Why there is no figure: the base or the site has no coordinates. */
  missing: z.enum(['base', 'site']).nullable(),
});
export type SiteDistance = z.infer<typeof siteDistanceSchema>;
