import { Inject, Injectable } from '@nestjs/common';
import type {
  Discom,
  DiscomInput,
  Product,
  ProductInput,
  RateCardSettings,
  RateCardValues,
  SubsidyRuleView,
} from '@oneohm/api-contracts';
import {
  discoms,
  products,
  rateCards,
  STARTER_RATE_CARD_NAME,
  subsidyRules,
} from '@oneohm/database';
import type { RateCard } from '@oneohm/domain';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { definedOnly, type Patch } from '../../common/patch';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';

const OWN_RATE_CARD_NAME = 'OneOhm rate card';

const withoutStamps = <T extends { createdAt: Date; updatedAt: Date }>({
  createdAt: _created,
  updatedAt: _updated,
  ...row
}: T) => row;

/**
 * Settings → Catalog & rates: products, DISCOMs, the rate card and subsidy rules
 * (PRD 3.9, 7.2). Every change is audited; accepted quotations keep their own snapshot.
 */
@Injectable()
export class CatalogAdminService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  async allProducts(): Promise<Product[]> {
    const rows = await this.db
      .select()
      .from(products)
      .orderBy(asc(products.category), asc(products.name));
    return rows.map(withoutStamps);
  }

  async createProduct(actor: Actor, input: ProductInput): Promise<Product> {
    await this.assertSkuFree(input.sku);
    assertProductShape(input);
    const [row] = await this.db.insert(products).values(input).returning();
    if (!row) throw new Error('Product insert returned nothing.');
    await recordAudit(this.db, actor.userId, 'product.created', 'product', row.id, { ...input });
    return withoutStamps(row);
  }

  async updateProduct(actor: Actor, id: string, patch: Patch<ProductInput>): Promise<Product> {
    const [existing] = await this.db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!existing) throw notFound('That product');
    if (patch.sku && patch.sku !== existing.sku) await this.assertSkuFree(patch.sku, id);
    const changes = definedOnly(patch);
    assertProductShape({ ...existing, ...changes });
    const [row] = await this.db
      .update(products)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    if (!row) throw notFound('That product');
    await recordAudit(this.db, actor.userId, 'product.updated', 'product', id, changes);
    return withoutStamps(row);
  }

  async createDiscom(actor: Actor, input: DiscomInput): Promise<Discom> {
    const [taken] = await this.db
      .select({ id: discoms.id })
      .from(discoms)
      .where(eq(discoms.code, input.code))
      .limit(1);
    if (taken) throw conflict('A DISCOM with this code already exists.', 'duplicate_discom');
    const [row] = await this.db.insert(discoms).values(input).returning();
    if (!row) throw new Error('DISCOM insert returned nothing.');
    await recordAudit(this.db, actor.userId, 'discom.created', 'discom', row.id, { ...input });
    return withoutStamps(row);
  }

  async updateDiscom(actor: Actor, id: string, patch: Patch<DiscomInput>): Promise<Discom> {
    if (patch.code) {
      const [taken] = await this.db
        .select({ id: discoms.id })
        .from(discoms)
        .where(and(eq(discoms.code, patch.code), ne(discoms.id, id)))
        .limit(1);
      if (taken) throw conflict('A DISCOM with this code already exists.', 'duplicate_discom');
    }
    const changes = definedOnly(patch);
    const [row] = await this.db
      .update(discoms)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(discoms.id, id))
      .returning();
    if (!row) throw notFound('That DISCOM');
    await recordAudit(this.db, actor.userId, 'discom.updated', 'discom', id, changes);
    return withoutStamps(row);
  }

  async rateCard(): Promise<RateCardSettings> {
    const [row] = await this.db
      .select()
      .from(rateCards)
      .orderBy(desc(rateCards.updatedAt))
      .limit(1);
    if (!row) throw notFound('The rate card');
    const rates = row.rates as RateCard;
    return {
      name: row.name,
      starter: row.name === STARTER_RATE_CARD_NAME,
      updatedAt: row.updatedAt.toISOString(),
      rates: {
        ...rates,
        discountApprovalBp: rates.discountApprovalBp ?? this.env.DISCOUNT_APPROVAL_BP,
      },
    };
  }

  async updateRateCard(actor: Actor, rates: RateCardValues): Promise<RateCardSettings> {
    const [row] = await this.db
      .select({ id: rateCards.id })
      .from(rateCards)
      .orderBy(desc(rateCards.updatedAt))
      .limit(1);
    if (!row) throw notFound('The rate card');
    await this.db
      .update(rateCards)
      .set({ name: OWN_RATE_CARD_NAME, rates, updatedAt: new Date() })
      .where(eq(rateCards.id, row.id));
    await recordAudit(this.db, actor.userId, 'rate_card.updated', 'rate_card', row.id, {
      ...rates,
    });
    return this.rateCard();
  }

  async subsidyRules(): Promise<SubsidyRuleView[]> {
    const rows = await this.db
      .select()
      .from(subsidyRules)
      .orderBy(asc(subsidyRules.category), desc(subsidyRules.validFrom));
    return rows.map(({ createdAt: _created, ...row }) => ({
      ...row,
      slabs: row.slabs as SubsidyRuleView['slabs'],
    }));
  }

  private async assertSkuFree(sku: string, exceptId?: string): Promise<void> {
    const [taken] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(
        exceptId ? and(eq(products.sku, sku), ne(products.id, exceptId)) : eq(products.sku, sku),
      )
      .limit(1);
    if (taken) throw conflict('Another product already uses this SKU.', 'duplicate_sku');
  }
}

/** Panels need a wattage to size systems; inverters and batteries need a rating. */
function assertProductShape(product: {
  category: string;
  wattageWp: number | null;
  ratedW: number | null;
}): void {
  if (product.category === 'panel' && !product.wattageWp) {
    throw invalid('Panels need their wattage.', { wattageWp: 'Add the panel wattage (Wp).' });
  }
  if ((product.category === 'inverter' || product.category === 'battery') && !product.ratedW) {
    throw invalid('Inverters and batteries need their rating.', { ratedW: 'Add the rating (W).' });
  }
}
