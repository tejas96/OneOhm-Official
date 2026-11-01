import { Inject, Injectable, Logger } from '@nestjs/common';
import type { QuotationPreviewInput, SubsidyImpact, SubsidyImpactRow } from '@oneohm/api-contracts';
import { customers, properties, quotations, subsidyRules } from '@oneohm/database';
import { calculateSubsidy, ruleInForce, type SubsidyRule } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { desc, eq, inArray } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { costingOf } from '../quotations/quotation-detail';
import { QuotationPricingService } from '../quotations/quotation-pricing.service';

type QuotationRow = typeof quotations.$inferSelect;

interface OpenQuotation {
  readonly quotation: QuotationRow;
  readonly customerName: string;
  readonly propertyLabel: string;
  readonly propertyHouseholds: number | null;
}

const householdsOf = (row: QuotationRow) =>
  (row.snapshot as { households?: number | null }).households ?? null;

/** The quotation's own choices, as the pricing engine takes them. */
function pricingInput(row: QuotationRow): QuotationPreviewInput {
  return {
    propertyId: row.propertyId,
    subsidyCategory: row.subsidyCategory,
    households: householdsOf(row),
    systemType: row.systemType,
    targetWp: row.targetWp,
    panelProductId: row.panelProductId,
    inverterProductId: row.inverterProductId,
    batteryProductId: row.batteryProductId,
    structureType: row.structureType,
    floors: row.floors,
    distanceKm: row.distanceKm,
    dcCableMeters: row.dcCableMeters,
    acCableMeters: row.acCableMeters,
    costing: costingOf(row.costing),
    discountPaise: row.discountPaise,
  };
}

/**
 * Which open quotations a subsidy rule change touches (PRD 3.5): each draft or sent one is
 * priced afresh and its expected subsidy compared with the one it saved. Nothing is
 * stored or changed; accepted quotations keep their snapshot and are never looked at.
 */
@Injectable()
export class SubsidyImpactService {
  private readonly logger = new Logger('SubsidyImpact');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly pricing: QuotationPricingService,
  ) {}

  async impact(asOf?: string): Promise<SubsidyImpact> {
    const today = todayIn();
    const date = asOf && asOf > today ? asOf : today;
    const open: OpenQuotation[] = await this.db
      .select({
        quotation: quotations,
        customerName: customers.name,
        propertyLabel: properties.label,
        propertyHouseholds: properties.households,
      })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .innerJoin(properties, eq(properties.id, quotations.propertyId))
      .where(inArray(quotations.status, ['draft', 'sent']))
      .orderBy(desc(quotations.createdAt));
    const rules = (await this.db.select().from(subsidyRules)) as unknown as SubsidyRule[];
    const changed: SubsidyImpactRow[] = [];
    for (const row of open) {
      const subsidy = await this.subsidyOn(row, rules, date);
      if (subsidy !== null && subsidy !== row.quotation.subsidyPaise) {
        changed.push(present(row, subsidy));
      }
    }
    return { asOf: date, checked: open.length, quotations: changed };
  }

  /**
   * The expected subsidy under the rules in force on `date`. The engine prices with
   * today's rule (eligibility, capacity, site facts); for a later rule, an eligible
   * quotation's amount is worked out again with that rule. Null when it cannot be priced.
   */
  private async subsidyOn(
    row: OpenQuotation,
    rules: readonly SubsidyRule[],
    date: string,
  ): Promise<number | null> {
    const { quotation } = row;
    try {
      const priced = await this.pricing.price(pricingInput(quotation));
      const { totals } = priced.preview;
      const rule = ruleInForce(rules, quotation.subsidyCategory, date);
      if (rule?.validFrom === priced.rule?.validFrom) return totals.subsidyPaise;
      if (totals.subsidyIneligible && totals.subsidyIneligible !== 'no_rule') return 0;
      return calculateSubsidy(
        {
          category: quotation.subsidyCategory,
          capacityWp: totals.capacityWp,
          panelsDcr: true,
          systemType: quotation.systemType,
          households: householdsOf(quotation) ?? row.propertyHouseholds ?? undefined,
        },
        rule,
      ).amountPaise;
    } catch (error) {
      this.logger.warn(
        `Could not price ${quotation.number} R${quotation.revision}: ${(error as Error).message}`,
      );
      return null;
    }
  }
}

function present(row: OpenQuotation, newSubsidyPaise: number): SubsidyImpactRow {
  const { quotation } = row;
  return {
    id: quotation.id,
    number: quotation.number,
    revision: quotation.revision,
    status: quotation.status === 'sent' ? 'sent' : 'draft',
    customer: { id: quotation.customerId, name: row.customerName },
    propertyLabel: row.propertyLabel,
    category: quotation.subsidyCategory,
    capacityWp: quotation.capacityWp,
    validUntil: quotation.validUntil,
    totalPaise: quotation.totalPaise,
    savedSubsidyPaise: quotation.subsidyPaise,
    newSubsidyPaise,
    savedEffectivePaise: quotation.effectivePaise,
    newEffectivePaise: Math.max(0, quotation.totalPaise - newSubsidyPaise),
  };
}
