import { Inject, Injectable } from '@nestjs/common';
import type { Company, Discom, Product } from '@oneohm/api-contracts';
import { companyProfile, discoms, products, rateCards } from '@oneohm/database';
import { type LineCategory, type RateCard, toCostingCard, withCatalogPrices } from '@oneohm/domain';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';
import { definedOnly, type Patch } from '../../common/patch';
import { DATABASE, type Database } from '../../config/core.module';
import { productViews } from './product-view';

@Injectable()
export class CatalogService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async products(category?: LineCategory): Promise<Product[]> {
    const condition = category
      ? and(eq(products.active, true), eq(products.category, category))
      : eq(products.active, true);
    const rows = await this.db
      .select()
      .from(products)
      .where(condition)
      .orderBy(asc(products.category), asc(products.name));
    return productViews(this.db, rows);
  }

  async product(id: string) {
    const [row] = await this.db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!row) throw notFound('That product');
    return row;
  }

  async discoms(): Promise<Discom[]> {
    const rows = await this.db.select().from(discoms).orderBy(asc(discoms.name));
    return rows.map(({ createdAt: _created, updatedAt: _updated, ...row }) => row);
  }

  async rateCard(): Promise<RateCard> {
    const [row] = await this.db
      .select()
      .from(rateCards)
      .orderBy(desc(rateCards.updatedAt))
      .limit(1);
    if (!row) throw notFound('The rate card');
    return toCostingCard(row.rates);
  }

  /** Today's card with each linked product's catalog price, cost and GST: what new quotes use. */
  async pricedRateCard(): Promise<RateCard> {
    const card = await this.rateCard();
    const ids = [...new Set(card.rateLines.flatMap((line) => line.productId ?? []))];
    if (ids.length === 0) return card;
    return withCatalogPrices(
      card,
      await this.db.select().from(products).where(inArray(products.id, ids)),
    );
  }

  async company(): Promise<Company> {
    const [row] = await this.db.select().from(companyProfile).limit(1);
    if (!row) throw notFound('The company profile');
    const {
      id: _id,
      logoKey: _logo,
      signatureKey: _signature,
      stampKey: _stamp,
      createdAt: _c,
      updatedAt: _u,
      ...company
    } = row;
    return company;
  }

  async updateCompany(actor: Actor, patch: Patch<Company>): Promise<Company> {
    const [row] = await this.db.select({ id: companyProfile.id }).from(companyProfile).limit(1);
    if (!row) throw notFound('The company profile');
    await this.db
      .update(companyProfile)
      .set({ ...definedOnly(patch), updatedAt: new Date() })
      .where(eq(companyProfile.id, row.id));
    await recordAudit(this.db, actor.userId, 'company.updated', 'company', row.id, patch);
    return this.company();
  }
}
