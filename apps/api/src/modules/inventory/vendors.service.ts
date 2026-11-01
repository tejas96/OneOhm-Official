import { Inject, Injectable } from '@nestjs/common';
import type { Vendor, VendorData } from '@oneohm/api-contracts';
import { goodsReceipts, payables, purchaseOrders, vendorProducts, vendors } from '@oneohm/database';
import { maskAccount } from '@oneohm/domain';
import { asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';
import type { Patch } from '../../common/patch';
import { DATABASE, type Database } from '../../config/core.module';

type VendorRow = typeof vendors.$inferSelect;
type VendorValues = Omit<VendorData, 'productIds'>;

/** Vendors, what they supply, and what OneOhm owes them (PRD 3.10). */
@Injectable()
export class VendorsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<Vendor[]> {
    const rows = await this.db.select().from(vendors).orderBy(asc(vendors.name));
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const supplied = await this.db
      .select()
      .from(vendorProducts)
      .where(inArray(vendorProducts.vendorId, ids));
    const owed = await this.db
      .select({
        vendorId: purchaseOrders.vendorId,
        amount: sql<string>`coalesce(sum(${payables.amountPaise} - ${payables.advanceAdjustedPaise}), 0)`,
      })
      .from(goodsReceipts)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, goodsReceipts.purchaseOrderId))
      .innerJoin(payables, eq(payables.id, goodsReceipts.payableId))
      .where(ne(payables.status, 'paid'))
      .groupBy(purchaseOrders.vendorId);
    const open = await this.db
      .select({ vendorId: purchaseOrders.vendorId, count: sql<string>`count(*)` })
      .from(purchaseOrders)
      .where(inArray(purchaseOrders.status, ['sent', 'partly_received']))
      .groupBy(purchaseOrders.vendorId);
    return rows.map((row) =>
      present(row, {
        productIds: supplied
          .filter((link) => link.vendorId === row.id)
          .map((link) => link.productId),
        outstandingPaise: Number(owed.find((entry) => entry.vendorId === row.id)?.amount ?? 0),
        openOrders: Number(open.find((entry) => entry.vendorId === row.id)?.count ?? 0),
      }),
    );
  }

  async create(actor: Actor, input: VendorData): Promise<Vendor> {
    const { productIds, ...values } = input;
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(vendors)
        .values({ ...columns(values), name: values.name })
        .returning({ id: vendors.id });
      if (!row) throw new Error('Vendor insert returned nothing.');
      if (productIds.length > 0) {
        await tx
          .insert(vendorProducts)
          .values(productIds.map((productId) => ({ vendorId: row.id, productId })));
      }
      await recordAudit(tx, actor.userId, 'vendor.created', 'vendor', row.id, { name: input.name });
      return row.id;
    });
    return this.one(id);
  }

  async update(actor: Actor, id: string, patch: Patch<VendorData>): Promise<Vendor> {
    const { productIds, ...values } = patch;
    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: vendors.id })
        .from(vendors)
        .where(eq(vendors.id, id));
      if (!existing) throw notFound('That vendor');
      const changes = columns(values);
      if (Object.keys(changes).length > 0) {
        await tx
          .update(vendors)
          .set({ ...changes, updatedAt: new Date() })
          .where(eq(vendors.id, id));
      }
      if (productIds) {
        await tx.delete(vendorProducts).where(eq(vendorProducts.vendorId, id));
        if (productIds.length > 0) {
          await tx
            .insert(vendorProducts)
            .values(productIds.map((productId) => ({ vendorId: id, productId })));
        }
      }
      await recordAudit(tx, actor.userId, 'vendor.updated', 'vendor', id, { ...values });
    });
    return this.one(id);
  }

  private async one(id: string): Promise<Vendor> {
    const vendor = (await this.list()).find((row) => row.id === id);
    if (!vendor) throw notFound('That vendor');
    return vendor;
  }
}

/** Input keys to table columns; only the keys present are set. */
function columns(values: Patch<VendorValues>): Partial<typeof vendors.$inferInsert> {
  const out: Partial<typeof vendors.$inferInsert> = {};
  if (values.name !== undefined) out.name = values.name;
  if (values.gstin !== undefined) out.gstin = values.gstin;
  if (values.contactName !== undefined) out.contactName = values.contactName;
  if (values.phone !== undefined) out.phoneE164 = values.phone;
  if (values.email !== undefined) out.email = values.email;
  if (values.address !== undefined) out.address = values.address;
  if (values.paymentTermsDays !== undefined) out.paymentTermsDays = values.paymentTermsDays;
  if (values.notes !== undefined) out.notes = values.notes;
  if (values.bankAccountName !== undefined) out.bankAccountName = values.bankAccountName;
  if (values.bankIfsc !== undefined) out.bankIfsc = values.bankIfsc;
  // The number is write-only: empty keeps what is saved.
  if (values.bankAccountNumber) out.bankAccountNumber = values.bankAccountNumber;
  if (values.active !== undefined) out.active = values.active;
  return out;
}

function present(
  row: VendorRow,
  extra: Pick<Vendor, 'productIds' | 'outstandingPaise' | 'openOrders'>,
): Vendor {
  return {
    id: row.id,
    name: row.name,
    gstin: row.gstin,
    contactName: row.contactName,
    phone: row.phoneE164,
    email: row.email,
    address: row.address,
    paymentTermsDays: row.paymentTermsDays,
    bankAccountName: row.bankAccountName,
    bankIfsc: row.bankIfsc,
    bankAccountMasked: row.bankAccountNumber ? maskAccount(row.bankAccountNumber) : null,
    notes: row.notes,
    active: row.active,
    ...extra,
  };
}
