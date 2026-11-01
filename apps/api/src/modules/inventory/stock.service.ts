import { Inject, Injectable } from '@nestjs/common';
import type {
  Dispatch,
  StockAdjustmentData,
  StockLocation,
  StockLocationData,
  StockMovement,
  StockRow,
} from '@oneohm/api-contracts';
import {
  products,
  projects,
  stockLevels,
  stockLocations,
  stockMovements,
  stockSerials,
  stockThresholds,
  type Transaction,
  users,
} from '@oneohm/database';
import { available, checkSerials, isSerialised, roundQuantity } from '@oneohm/domain';
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { dispatchList } from './material-read';
import { moveStock, resolveLocation } from './stock-ledger';

/** Stock by product and location, shortage alerts and the movement ledger (PRD 3.10). */
@Injectable()
export class StockService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<StockRow[]> {
    const catalog = await this.db
      .select()
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.category), asc(products.name));
    const levels = await this.db
      .select({ level: stockLevels, name: stockLocations.name })
      .from(stockLevels)
      .innerJoin(stockLocations, eq(stockLocations.id, stockLevels.locationId));
    const thresholds = await this.db.select().from(stockThresholds);
    return catalog.map((product) => {
      const own = levels.filter((row) => row.level.productId === product.id);
      const onHand = roundQuantity(own.reduce((sum, row) => sum + row.level.onHand, 0));
      const reserved = roundQuantity(own.reduce((sum, row) => sum + row.level.reserved, 0));
      const free = available({ onHand, reserved });
      const minimum = thresholds.find((row) => row.productId === product.id)?.minimum ?? null;
      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        brand: product.brand,
        category: product.category,
        unit: product.unit,
        serialised: isSerialised(product.category),
        onHand,
        reserved,
        available: free,
        minimum,
        low: minimum !== null && free < minimum,
        valuePaise: Math.round(onHand * product.costPaise),
        byLocation: own.map((row) => ({
          locationId: row.level.locationId,
          name: row.name,
          onHand: row.level.onHand,
          reserved: row.level.reserved,
        })),
      };
    });
  }

  dispatches(): Promise<Dispatch[]> {
    return dispatchList(this.db);
  }

  async locations(): Promise<StockLocation[]> {
    const rows = await this.db.select().from(stockLocations).orderBy(asc(stockLocations.name));
    return rows.map(({ createdAt: _created, ...row }) => row);
  }

  async createLocation(actor: Actor, input: StockLocationData): Promise<StockLocation> {
    const [taken] = await this.db
      .select({ id: stockLocations.id })
      .from(stockLocations)
      .where(eq(stockLocations.code, input.code));
    if (taken) throw invalid('That code is in use.', { code: 'Pick another code.' });
    const [row] = await this.db.insert(stockLocations).values(input).returning();
    if (!row) throw new Error('Location insert returned nothing.');
    await recordAudit(this.db, actor.userId, 'stock_location.created', 'stock_location', row.id, {
      ...input,
    });
    const { createdAt: _created, ...location } = row;
    return location;
  }

  /** Opening stock and count corrections. Serialised items name each unit. */
  async adjust(actor: Actor, input: StockAdjustmentData): Promise<StockRow[]> {
    const [product] = await this.db.select().from(products).where(eq(products.id, input.productId));
    if (!product) throw notFound('That product');
    const serialised = isSerialised(product.category);
    if (serialised && !Number.isInteger(input.quantity)) {
      throw invalid('Count whole units.', { quantity: 'Use a whole number.' });
    }
    let serials: string[] = [];
    if (serialised) {
      const checked = checkSerials(Math.abs(input.quantity), input.serials);
      if ('problem' in checked) {
        throw invalid('Enter one serial number per unit.', {
          serials: 'One serial per unit, none repeated.',
        });
      }
      serials = checked.serials;
    }
    await this.db.transaction(async (tx) => {
      const location = await resolveLocation(tx, input.locationId);
      if (serialised)
        await this.adjustSerials(tx, product.id, location.id, input.quantity, serials);
      await moveStock(tx, {
        productId: product.id,
        label: product.name,
        locationId: location.id,
        kind: 'adjustment',
        onHand: input.quantity,
        reserved: 0,
        note: serials.length ? `${input.reason} (${serials.join(', ')})` : input.reason,
        userId: actor.userId,
      });
      await recordAudit(tx, actor.userId, 'stock.adjusted', 'product', product.id, {
        quantity: input.quantity,
        reason: input.reason,
      });
    });
    return this.list();
  }

  async setThreshold(actor: Actor, productId: string, minimum: number | null): Promise<StockRow[]> {
    if (minimum === null) {
      await this.db.delete(stockThresholds).where(eq(stockThresholds.productId, productId));
    } else {
      await this.db
        .insert(stockThresholds)
        .values({ productId, minimum })
        .onConflictDoUpdate({
          target: stockThresholds.productId,
          set: { minimum, updatedAt: new Date() },
        });
    }
    await recordAudit(this.db, actor.userId, 'stock.threshold', 'product', productId, { minimum });
    return this.list();
  }

  async movements(filter: {
    productId?: string | undefined;
    projectId?: string | undefined;
  }): Promise<StockMovement[]> {
    const conditions: SQL[] = [];
    if (filter.productId) conditions.push(eq(stockMovements.productId, filter.productId));
    if (filter.projectId) conditions.push(eq(stockMovements.projectId, filter.projectId));
    const rows = await this.db
      .select({
        movement: stockMovements,
        productName: products.name,
        unit: products.unit,
        locationName: stockLocations.name,
        projectCode: projects.code,
        by: users.fullName,
      })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .innerJoin(stockLocations, eq(stockLocations.id, stockMovements.locationId))
      .leftJoin(projects, eq(projects.id, stockMovements.projectId))
      .leftJoin(users, eq(users.id, stockMovements.userId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(stockMovements.createdAt))
      .limit(200);
    return rows.map(({ movement, ...row }) => ({
      id: movement.id,
      kind: movement.kind,
      onHandDelta: movement.onHandDelta,
      reservedDelta: movement.reservedDelta,
      note: movement.note,
      at: movement.createdAt.toISOString(),
      ...row,
    }));
  }

  private async adjustSerials(
    tx: Transaction,
    productId: string,
    locationId: string,
    quantity: number,
    serials: string[],
  ): Promise<void> {
    const existing = await tx
      .select()
      .from(stockSerials)
      .where(and(eq(stockSerials.productId, productId), inArray(stockSerials.serial, serials)));
    if (quantity > 0) {
      if (existing.length > 0) {
        throw conflict(`Already recorded: ${existing.map((row) => row.serial).join(', ')}.`);
      }
      await tx
        .insert(stockSerials)
        .values(serials.map((serial) => ({ productId, serial, locationId })));
      return;
    }
    const removable = existing.filter(
      (row) => row.status === 'in_stock' && row.locationId === locationId,
    );
    if (removable.length !== serials.length) {
      throw conflict('Only serials in stock at this location can be written off.', 'serial_state');
    }
    await tx.delete(stockSerials).where(
      inArray(
        stockSerials.id,
        removable.map((row) => row.id),
      ),
    );
  }
}
