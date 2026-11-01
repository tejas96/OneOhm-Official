import { Inject, Injectable } from '@nestjs/common';
import type { QuotationInput, QuotationPreview, QuotationTotals } from '@oneohm/api-contracts';
import { products, subsidyRules } from '@oneohm/database';
import {
  calculateSubsidy,
  designSystem,
  type PanelProduct,
  type PricedProduct,
  priceQuote,
  type QuoteLineInput,
  type RateCard,
  ruleInForce,
  type SubsidyRule,
} from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import { invalid } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { CatalogService } from '../catalog/catalog.service';
import { CustomersService } from '../crm/customers.service';

type ProductRow = typeof products.$inferSelect;

export interface PricedQuotation {
  readonly preview: QuotationPreview;
  readonly lines: readonly (QuoteLineInput & {
    amountPaise: number;
    contingencyPaise: number;
    discountPaise: number;
    taxPaise: number;
    totalPaise: number;
    costPaise: number;
  })[];
  readonly rates: RateCard;
  readonly rule: SubsidyRule | null;
}

const asPriced = (row: ProductRow): PricedProduct => ({
  id: row.id,
  name: row.brand === 'Starter catalog' ? row.name : `${row.brand} ${row.name}`,
  unit: row.unit,
  pricePaise: row.pricePaise,
  costPaise: row.costPaise,
  taxRateBp: row.taxRateBp,
});

/** The one place quotation money is calculated (PRD 3.9: no duplicate pricing logic). */
@Injectable()
export class QuotationPricingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly catalog: CatalogService,
    private readonly customers: CustomersService,
  ) {}

  async price(input: QuotationInput): Promise<PricedQuotation> {
    const property = await this.customers.property(input.propertyId);
    const panel = await this.product(input.panelProductId, 'panel', 'panelProductId');
    const inverter = await this.product(input.inverterProductId, 'inverter', 'inverterProductId');
    const battery = input.batteryProductId
      ? await this.product(input.batteryProductId, 'battery', 'batteryProductId')
      : undefined;
    const rates = await this.catalog.rateCard();
    const rules = (await this.db.select().from(subsidyRules)) as unknown as SubsidyRule[];
    const rule = ruleInForce(rules, input.subsidyCategory, todayIn());

    const totalsFor = (panelRow: ProductRow, discountPaise: number) => {
      const design = designSystem({
        targetWp: input.targetWp,
        panel: {
          ...asPriced(panelRow),
          wattageWp: panelRow.wattageWp ?? 0,
          dcr: panelRow.dcr,
        } satisfies PanelProduct,
        inverter: asPriced(inverter),
        battery: battery ? asPriced(battery) : undefined,
        site: {
          floors: input.floors,
          structureType: input.structureType,
          distanceKm: input.distanceKm,
          dcCableMeters: input.dcCableMeters ?? undefined,
          acCableMeters: input.acCableMeters ?? undefined,
        },
        rates,
      });
      const pricing = priceQuote(design.lines, {
        contingencyBp: rates.contingencyBp,
        discountPaise,
      });
      const subsidy = calculateSubsidy(
        {
          category: input.subsidyCategory,
          capacityWp: design.capacityWp,
          panelsDcr: panelRow.dcr,
          systemType: input.systemType,
          households: input.households ?? property.households ?? undefined,
          meterInSocietyName: property.meterInSocietyName ?? undefined,
          propertyAlreadySubsidised: property.subsidyClaimed,
        },
        rule,
      );
      const totals: QuotationTotals = {
        moduleCount: design.moduleCount,
        capacityWp: design.capacityWp,
        subtotalPaise: pricing.subtotalPaise,
        contingencyPaise: pricing.contingencyPaise,
        discountPaise: pricing.discountPaise,
        taxPaise: pricing.taxPaise,
        totalPaise: pricing.totalPaise,
        costPaise: pricing.costPaise,
        marginPaise: pricing.marginPaise,
        subsidyPaise: subsidy.amountPaise,
        subsidyIneligible: subsidy.ineligible,
        effectivePaise: Math.max(0, pricing.totalPaise - subsidy.amountPaise),
      };
      return { totals, lines: pricing.lines };
    };

    const chosen = totalsFor(panel, input.discountPaise);
    const undiscounted = totalsFor(panel, 0);
    const alternative = await this.alternativePanel(panel);
    const other = alternative ? totalsFor(alternative, input.discountPaise) : null;
    const comparison = other
      ? panel.dcr
        ? { dcr: chosen.totals, nonDcr: other.totals }
        : { dcr: other.totals, nonDcr: chosen.totals }
      : null;
    const limit = Math.round(
      (undiscounted.totals.totalPaise * this.env.DISCOUNT_APPROVAL_BP) / 10_000,
    );
    return {
      preview: {
        totals: chosen.totals,
        lines: chosen.lines.map(({ unitCostPaise: _cost, ...line }) => line),
        comparison,
        discountNeedsApproval: input.discountPaise > limit,
      },
      lines: chosen.lines,
      rates,
      rule,
    };
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
