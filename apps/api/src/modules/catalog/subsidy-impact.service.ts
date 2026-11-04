import { Inject, Injectable, Logger } from '@nestjs/common';
import type { QuotationPreviewInput, SubsidyImpact, SubsidyImpactRow } from '@oneohm/api-contracts';
import {
  customers,
  properties,
  quotations,
  stateSubsidyRules,
  subsidyRules,
} from '@oneohm/database';
import type { StateTopUpRule, SubsidyRule } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { desc, eq, inArray } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { costingOf } from '../quotations/quotation-detail';
import { invertersOf } from '../quotations/quotation-inverters';
import { QuotationPricingService } from '../quotations/quotation-pricing.service';
import { supportOn } from './subsidy-on-date';

type QuotationRow = typeof quotations.$inferSelect;

interface OpenQuotation {
  readonly quotation: QuotationRow;
  readonly customerName: string;
  readonly propertyLabel: string;
  readonly propertyHouseholds: number | null;
  readonly siteState: string;
  readonly lowIncomeHousehold: boolean;
}

interface Rules {
  readonly central: readonly SubsidyRule[];
  readonly state: readonly StateTopUpRule[];
}

const householdsOf = (row: QuotationRow) =>
  (row.snapshot as { households?: number | null }).households ?? null;

/** The quotation's own choices, as the pricing engine takes them. */
function pricingInput(
  row: QuotationRow,
  inverters: QuotationPreviewInput['inverters'],
): QuotationPreviewInput {
  return {
    propertyId: row.propertyId,
    subsidyCategory: row.subsidyCategory,
    households: householdsOf(row),
    systemType: row.systemType,
    targetWp: row.targetWp,
    panelProductId: row.panelProductId,
    inverters,
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
 * priced afresh and its expected support (central subsidy plus any state top-up) compared
 * with what it saved. Nothing is
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
        siteState: properties.state,
        lowIncomeHousehold: properties.lowIncomeHousehold,
      })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .innerJoin(properties, eq(properties.id, quotations.propertyId))
      .where(inArray(quotations.status, ['draft', 'sent']))
      .orderBy(desc(quotations.createdAt));
    const rules: Rules = {
      central: (await this.db.select().from(subsidyRules)) as unknown as SubsidyRule[],
      state: await this.db.select().from(stateSubsidyRules),
    };
    const changed: SubsidyImpactRow[] = [];
    for (const row of open) {
      // Central subsidy and the state top-up together: both come off what the customer pays.
      const support = await this.supportOn(row, rules, date);
      const saved = row.quotation.subsidyPaise + row.quotation.stateSupportPaise;
      if (support !== null && support !== saved) changed.push(present(row, saved, support));
    }
    return { asOf: date, checked: open.length, quotations: changed };
  }

  /** Expected central plus state support under the rules on `date`; null if unpriceable. */
  private async supportOn(row: OpenQuotation, rules: Rules, date: string): Promise<number | null> {
    const { quotation } = row;
    try {
      const inverters = await invertersOf(this.db, quotation.id);
      const priced = await this.pricing.price(pricingInput(quotation, inverters));
      const { totals } = priced.preview;
      const support = supportOn({
        category: quotation.subsidyCategory,
        systemType: quotation.systemType,
        households: householdsOf(quotation) ?? row.propertyHouseholds,
        capacityWp: totals.capacityWp,
        siteState: row.siteState,
        lowIncomeHousehold: row.lowIncomeHousehold,
        priced: {
          subsidyPaise: totals.subsidyPaise,
          subsidyIneligible: totals.subsidyIneligible,
          stateSupportPaise: totals.stateSupportPaise ?? 0,
          ruleFrom: priced.rule?.validFrom ?? null,
          stateRuleFrom: priced.stateRule?.validFrom ?? null,
        },
        rules: rules.central,
        stateRules: rules.state,
        date,
      });
      return support.subsidyPaise + support.stateSupportPaise;
    } catch (error) {
      this.logger.warn(
        `Could not price ${quotation.number} R${quotation.revision}: ${(error as Error).message}`,
      );
      return null;
    }
  }
}

function present(
  row: OpenQuotation,
  savedSubsidyPaise: number,
  newSubsidyPaise: number,
): SubsidyImpactRow {
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
    savedSubsidyPaise,
    newSubsidyPaise,
    savedEffectivePaise: quotation.effectivePaise,
    newEffectivePaise: Math.max(0, quotation.totalPaise - newSubsidyPaise),
  };
}
