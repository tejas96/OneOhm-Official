import type { QuotationInput } from '@oneohm/api-contracts';
import { type Database, projectFacts } from '@oneohm/database';
import { DEFAULT_SQM_PER_KWP, type RoofFit, roofFit } from '@oneohm/domain';
import { formatKwp } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import type { CatalogService } from '../catalog/catalog.service';
import type { PricedQuotation } from './quotation-pricing.service';

/** The survey fact holding the usable, shadow-free area in m². */
export const SHADOW_FREE_AREA_FACT = 'shadow_free_area_sqm';

/** The smallest system a quotation may be for (the quotation input's own floor). */
const SMALLEST_WP = 500;

export interface SurveyRepricing {
  /** The accepted quotation priced with what the survey measured. */
  readonly priced: PricedQuotation;
  readonly roof: RoofFit | null;
  /** Set when the roof cannot hold the quoted size: the revision must happen. */
  readonly roofNote: string | null;
  /** What a revision is drafted with: sized to fit the roof when it does not. */
  readonly revisionInput: QuotationInput;
}

const areaOf = (value: string | undefined): number | null => {
  const parsed = value === undefined ? Number.NaN : Number.parseFloat(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Survey-linked capacity (PRD 3.5): the measured shadow-free area is checked against the
 * configured m² per kWp. When it cannot hold the quoted size, the revision is drafted at
 * the largest size that fits, in whole panels, for the manager to confirm.
 */
export async function surveyRepricing(
  db: Database,
  catalog: CatalogService,
  context: {
    readonly priced: PricedQuotation;
    readonly input: QuotationInput;
    readonly projectId: string;
  },
): Promise<SurveyRepricing> {
  const { priced, input, projectId } = context;
  const [fact] = await db
    .select({ value: projectFacts.value })
    .from(projectFacts)
    .where(and(eq(projectFacts.projectId, projectId), eq(projectFacts.key, SHADOW_FREE_AREA_FACT)))
    .limit(1);
  const today = await catalog.rateCard();
  const panel = await catalog.product(input.panelProductId);
  const capacityWp = priced.preview.totals.capacityWp;
  const roof = roofFit({
    capacityWp,
    areaSqm: areaOf(fact?.value),
    sqmPerKwp: today.sqmPerKwp ?? DEFAULT_SQM_PER_KWP,
    panelWp: panel.wattageWp ?? 0,
  });
  if (!roof || roof.fits) return { priced, roof, roofNote: null, revisionInput: input };
  const resized = roof.fitsWp >= SMALLEST_WP;
  const roofNote =
    `The shadow-free area of ${roof.areaSqm} m² holds ${formatKwp(roof.fitsWp)} at ` +
    `${roof.sqmPerKwp} m² per kWp, not the quoted ${formatKwp(capacityWp)}` +
    (resized ? '; the revision is sized to fit.' : '; agree a new design with the customer.');
  return {
    priced,
    roof,
    roofNote,
    revisionInput: resized ? { ...input, targetWp: roof.fitsWp } : input,
  };
}
