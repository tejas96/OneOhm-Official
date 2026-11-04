import { Inject, Injectable } from '@nestjs/common';
import type {
  Discom,
  DiscomInput,
  Product,
  ProductInput,
  RateCardSettings,
  RateCardValues,
} from '@oneohm/api-contracts';
import { discoms, products, quotations, rateCards, STARTER_RATE_CARD_NAME } from '@oneohm/database';
import { type CostingCard, toCostingCard } from '@oneohm/domain';
import { and, asc, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { definedOnly, type Patch } from '../../common/patch';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { productViews } from './product-view';
import { quotesBrokenBy } from './rate-card-use';
import { rateLinesUsing, rateProductProblem } from './rate-products';

const OWN_RATE_CARD_NAME = 'OneOhm rate card';

const withoutStamps = <T extends { createdAt: Date; updatedAt: Date }>({
  createdAt: _created,
  updatedAt: _updated,
  ...row
}: T) => row;

/**
 * Settings → Catalog & rates: products, DISCOMs and the rate card (PRD 3.9, 7.2); subsidy
 * rules have their own service. Every change is audited; accepted quotations keep their
 * own snapshot.
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
    return productViews(this.db, rows);
  }

  async createProduct(actor: Actor, input: ProductInput): Promise<Product> {
    await this.assertSkuFree(input.sku);
    assertProductShape(input);
    const [row] = await this.db.insert(products).values(input).returning();
    if (!row) throw new Error('Product insert returned nothing.');
    await recordAudit(this.db, actor.userId, 'product.created', 'product', row.id, { ...input });
    return this.view(row);
  }

  async updateProduct(actor: Actor, id: string, patch: Patch<ProductInput>): Promise<Product> {
    const [existing] = await this.db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!existing) throw notFound('That product');
    if (patch.sku && patch.sku !== existing.sku) await this.assertSkuFree(patch.sku, id);
    const changes = definedOnly(patch);
    assertProductShape({ ...existing, ...changes });
    if (existing.active && changes.active === false) await this.assertNotOnRateCard(id);
    const [row] = await this.db
      .update(products)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    if (!row) throw notFound('That product');
    await recordAudit(this.db, actor.userId, 'product.updated', 'product', id, changes);
    return this.view(row);
  }

  private async view(row: typeof products.$inferSelect): Promise<Product> {
    const [product] = await productViews(this.db, [row]);
    if (!product) throw notFound('That product');
    return product;
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
    const rates = toCostingCard(row.rates);
    return {
      name: row.name,
      starter: row.name === STARTER_RATE_CARD_NAME,
      updatedAt: row.updatedAt.toISOString(),
      rates: {
        ...rates,
        discountApprovalBp: rates.discountApprovalBp ?? this.env.DISCOUNT_APPROVAL_BP,
      } as RateCardValues,
    };
  }

  async updateRateCard(actor: Actor, rates: RateCardValues): Promise<RateCardSettings> {
    const [row] = await this.db
      .select({ id: rateCards.id })
      .from(rateCards)
      .orderBy(desc(rateCards.updatedAt))
      .limit(1);
    if (!row) throw notFound('The rate card');
    await this.assertRateProducts(rates);
    await this.assertOpenQuotesKept(rates);
    // A linked product's GST is read from the catalog when pricing, never stored here.
    const saved = {
      ...rates,
      rateLines: rates.rateLines.map(({ taxRateBp: _tax, ...line }) => line),
    };
    await this.db
      .update(rateCards)
      .set({ name: OWN_RATE_CARD_NAME, rates: saved, updatedAt: new Date() })
      .where(eq(rateCards.id, row.id));
    await recordAudit(this.db, actor.userId, 'rate_card.updated', 'rate_card', row.id, {
      ...rates,
    });
    return this.rateCard();
  }

  /** Every product a rate line names must be in the catalog and in use. */
  private async assertRateProducts(rates: RateCardValues): Promise<void> {
    const ids = [...new Set(rates.rateLines.flatMap((line) => line.productId ?? []))];
    if (ids.length === 0) return;
    const found = await this.db
      .select({ id: products.id, active: products.active })
      .from(products)
      .where(inArray(products.id, ids));
    const problem = rateProductProblem(rates.rateLines, found);
    if (!problem) return;
    throw invalid(
      problem.archived
        ? 'A rate is linked to an archived product.'
        : 'A rate names a product that is not in the catalog.',
      {
        [`rateLines.${problem.index}.productId`]: problem.archived
          ? 'Pick a product that is in use, or unlink it.'
          : 'Pick the product again.',
      },
    );
  }

  /** Draft and sent quotes must still price: a rate their detail names cannot go. */
  private async assertOpenQuotesKept(rates: RateCardValues): Promise<void> {
    const open = await this.db
      .select({ number: quotations.number, costing: quotations.costing })
      .from(quotations)
      .where(and(inArray(quotations.status, ['draft', 'sent']), isNotNull(quotations.costing)));
    if (open.length === 0) return;
    const current = toCostingCard((await this.rateCard()).rates);
    const broken = quotesBrokenBy(current, rates as CostingCard, open);
    if (broken.length === 0) return;
    throw conflict(
      `${broken.length === 1 ? '1 open quote uses' : `${broken.length} open quotes use`} a rate you removed or changed (${broken.slice(0, 5).join(', ')}). Edit those quotes first, or keep the rate.`,
      'rate_in_use',
    );
  }

  /** A product a rate line sells cannot be archived: the rate would sell it on. */
  private async assertNotOnRateCard(id: string): Promise<void> {
    const card = await this.rateCard();
    const using = rateLinesUsing(card.rates.rateLines, id);
    if (using.length === 0) return;
    throw conflict(
      `This product is linked to the rate card (${using.join(', ')}). Unlink it there before archiving it.`,
      'product_on_rate_card',
    );
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
