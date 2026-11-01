import { Inject, Injectable } from '@nestjs/common';
import type {
  QuotationDetail,
  QuotationInput,
  QuotationPreview,
  QuotationPreviewInput,
} from '@oneohm/api-contracts';
import { products, subsidyRules } from '@oneohm/database';
import {
  atAcceptedPrice,
  detailProblems,
  type PanelProduct,
  type PricedProduct,
  type RateCard,
  ruleInForce,
  type StateTopUpRule,
  type SubsidyRule,
} from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { invalid } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { CatalogService } from '../catalog/catalog.service';
import { CustomersService } from '../crm/customers.service';
import { type AcceptedPricing, acceptedPricing, savedFor } from './accepted-pricing';
import { resolveExtras } from './quotation-extras';
import { costingView, type QuotedLine, quoteTotals } from './quotation-totals';
import { type SiteFacts, siteFactsWithoutProperty } from './site-facts';
import { stateRuleToday } from './state-support-line';
import { type SurveyRepricing, surveyRepricing } from './survey-repricing';

type ProductRow = typeof products.$inferSelect;

export interface PricedQuotation {
  readonly preview: QuotationPreview;
  readonly lines: readonly QuotedLine[];
  readonly rates: RateCard;
  readonly rule: SubsidyRule | null;
  readonly stateRule: StateTopUpRule | null;
}

export interface PriceOptions {
  /** Re-price with an accepted quotation's own rates, product prices and subsidy rule. */
  readonly against?: AcceptedPricing | undefined;
}

const asPriced = (row: ProductRow): PricedProduct => ({
  id: row.id,
  name: row.brand === 'Starter catalog' ? row.name : `${row.brand} ${row.name}`,
  unit: row.unit,
  pricePaise: row.pricePaise,
  costPaise: row.costPaise,
  taxRateBp: row.taxRateBp,
});

const asPanel = (row: ProductRow): PanelProduct => ({
  ...asPriced(row),
  wattageWp: row.wattageWp ?? 0,
  dcr: row.dcr,
});

/** A quotation's own detail may only name rates the card still has. */
function assertDetailPriceable(rates: RateCard, input: QuotationPreviewInput): void {
  const problems = input.costing ? detailProblems(rates, input.costing) : [];
  if (problems.length === 0) return;
  throw invalid(
    'Some of this quotation’s detail names rates that are no longer on the rate card.',
    Object.fromEntries(problems.map((problem) => [problem.path.join('.'), problem.message])),
  );
}

/** The one place quotation money is calculated (PRD 3.9: no duplicate pricing logic). */
@Injectable()
export class QuotationPricingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly catalog: CatalogService,
    private readonly customers: CustomersService,
  ) {}

  async price(input: QuotationPreviewInput, options: PriceOptions = {}): Promise<PricedQuotation> {
    const against = options.against;
    const site = await this.siteFacts(input);
    const panel = await this.product(input.panelProductId, 'panel', 'panelProductId');
    const inverter = await this.product(input.inverterProductId, 'inverter', 'inverterProductId');
    const battery = input.batteryProductId
      ? await this.product(input.batteryProductId, 'battery', 'batteryProductId')
      : undefined;
    const rates = against?.rates ?? (await this.catalog.pricedRateCard());
    assertDetailPriceable(rates, input);
    const rule = against ? against.rule : await this.ruleToday(input);
    const stateRule = against ? against.stateRule : await stateRuleToday(this.db, site);
    const extras = resolveExtras(input.extras ?? [], {
      rates,
      products: await this.extraProducts(input),
      saved: against?.lines,
    });
    const parts = {
      input,
      site,
      inverter: atAcceptedPrice(
        asPriced(inverter),
        savedFor(against, 'inverter', inverter.id),
        'inverter',
      ),
      battery: battery
        ? atAcceptedPrice(asPriced(battery), savedFor(against, 'battery', battery.id), 'battery')
        : undefined,
      extras,
      rates,
      rule,
      stateRule,
    };
    const totalsFor = (panelRow: ProductRow, discountPaise: number) =>
      quoteTotals(
        {
          ...parts,
          panel: atAcceptedPrice(
            asPanel(panelRow),
            savedFor(against, 'panel', panelRow.id),
            'panel',
          ),
        },
        discountPaise,
      );

    const chosen = totalsFor(panel, input.discountPaise);
    const undiscounted = totalsFor(panel, 0);
    const alternative = against ? null : await this.alternativePanel(panel);
    const other = alternative ? totalsFor(alternative, input.discountPaise) : null;
    const comparison = other
      ? panel.dcr
        ? { dcr: chosen.totals, nonDcr: other.totals }
        : { dcr: other.totals, nonDcr: chosen.totals }
      : null;
    const limit = Math.round(
      (undiscounted.totals.totalPaise *
        (rates.discountApprovalBp ?? this.env.DISCOUNT_APPROVAL_BP)) /
        10_000,
    );
    return {
      preview: {
        totals: chosen.totals,
        lines: chosen.lines.map(({ unitCostPaise: _cost, productId: _product, ...line }) => line),
        comparison,
        // A downward adjustment counts like a discount (PRD 3.9 approval rules).
        discountNeedsApproval: chosen.reductionPaise > limit,
        costing: costingView(rates, chosen),
      },
      lines: chosen.lines,
      rates,
      rule,
      stateRule,
    };
  }

  /** A survey revision of an accepted quotation, priced as that quotation was. */
  async priceAgainst(input: QuotationInput, acceptedId: string): Promise<PricedQuotation> {
    return this.price(input, { against: await acceptedPricing(this.db, acceptedId) });
  }

  /**
   * After the survey (PRD 3.5): the accepted quotation re-priced with only what was
   * measured, and whether the shadow-free area holds the quoted size.
   */
  async priceAfterSurvey(
    accepted: QuotationDetail,
    input: QuotationInput,
    projectId: string,
  ): Promise<SurveyRepricing> {
    const priced = await this.priceAgainst(input, accepted.id);
    return surveyRepricing(this.db, this.catalog, { priced, input, projectId });
  }

  private async ruleToday(input: QuotationPreviewInput): Promise<SubsidyRule | null> {
    const rules = (await this.db.select().from(subsidyRules)) as unknown as SubsidyRule[];
    return ruleInForce(rules, input.subsidyCategory, todayIn());
  }

  /**
   * The site facts the subsidy depends on: from the property when there is one, else
   * from the preview's own fields (a fresh lead quoted in the field).
   */
  private async siteFacts(input: QuotationPreviewInput): Promise<SiteFacts> {
    if (input.propertyId) return this.customers.property(input.propertyId);
    return siteFactsWithoutProperty(input);
  }

  /** Catalog products picked for optional items and gifts. */
  private async extraProducts(input: QuotationPreviewInput): Promise<Map<string, ProductRow>> {
    const ids = [...new Set((input.extras ?? []).flatMap((extra) => extra.productId ?? []))];
    if (ids.length === 0) return new Map();
    const rows = await this.db.select().from(products).where(inArray(products.id, ids));
    if (rows.length !== ids.length) {
      throw invalid('A product on an extra line is not in the catalog.', {
        extras: 'Pick the product again.',
      });
    }
    return new Map(rows.map((row) => [row.id, row]));
  }

  /** The closest panel of the other kind (DCR ↔ non-DCR), for the side-by-side comparison. */
  private async alternativePanel(panel: ProductRow): Promise<ProductRow | null> {
    const candidates = await this.db
      .select()
      .from(products)
      .where(
        and(
          eq(products.category, 'panel'),
          eq(products.active, true),
          eq(products.dcr, !panel.dcr),
        ),
      );
    const target = panel.wattageWp ?? 0;
    return (
      candidates.sort(
        (left, right) =>
          Math.abs((left.wattageWp ?? 0) - target) - Math.abs((right.wattageWp ?? 0) - target),
      )[0] ?? null
    );
  }

  private async product(
    id: string,
    category: ProductRow['category'],
    field: string,
  ): Promise<ProductRow> {
    const row = await this.catalog.product(id);
    if (row.category !== category || (category === 'panel' && !row.wattageWp)) {
      throw invalid(`Choose a ${category} for this line.`, {
        [field]: `This is not a ${category}.`,
      });
    }
    return row;
  }
}
