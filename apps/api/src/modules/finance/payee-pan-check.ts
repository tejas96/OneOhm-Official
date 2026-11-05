import { contractors, type DatabaseExecutor, payables, vendors } from '@oneohm/database';
import {
  isValidPan,
  noPanMinimumBp,
  TDS_MAX_BP,
  type VendorBillKind,
  vendorTdsShortfall,
} from '@oneohm/domain';
import { eq, sql } from 'drizzle-orm';
import { conflict } from '../../common/http/errors';
import { payeeOf } from '../bank-payouts/payees';

/**
 * A payee with no valid PAN cannot have a low TDS rate (Income-tax Act 2025, s.397(2)).
 *
 * - Contractors: at least 20%.
 * - Vendors, goods bought on a goods receipt (the old 194Q): at least 5%.
 * - Vendors, any other bill (services): at least 20%. A hand-typed bill names no vendor
 *   record, so it counts only when its party name is exactly one saved vendor.
 *
 * A vendor's PAN is the one saved on the vendor page, else the one inside their GSTIN.
 * Bills with no known payee are not checked.
 */
export async function assertPanForTds(
  db: DatabaseExecutor,
  payableId: string,
  tdsBp: number,
): Promise<void> {
  if (tdsBp <= 0 || tdsBp >= TDS_MAX_BP) return;
  const payee = await payeeOf(db, payableId);
  if (payee?.kind === 'contractor') return checkContractor(db, payee);
  if (payee?.kind === 'vendor') return checkVendor(db, payee.id, payee.name, 'goods', tdsBp);
  const [bill] = await db
    .select({ party: payables.party, name: payables.partyName })
    .from(payables)
    .where(eq(payables.id, payableId))
    .limit(1);
  if (bill?.party !== 'vendor') return;
  const named = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(sql`lower(${vendors.name}) = lower(${bill.name})`)
    .limit(2);
  if (named.length === 1 && named[0]) {
    await checkVendor(db, named[0].id, bill.name, 'services', tdsBp);
  }
}

async function checkContractor(
  db: DatabaseExecutor,
  payee: { id: string; name: string },
): Promise<void> {
  const [row] = await db
    .select({ pan: contractors.pan })
    .from(contractors)
    .where(eq(contractors.id, payee.id))
    .limit(1);
  if (isValidPan(row?.pan ?? null)) return;
  throw conflict(
    `${payee.name} has no valid PAN, so TDS must be at least 20% (section 397(2)). Add their PAN first, or use 20%.`,
  );
}

async function checkVendor(
  db: DatabaseExecutor,
  id: string,
  name: string,
  kind: VendorBillKind,
  tdsBp: number,
): Promise<void> {
  const [row] = await db
    .select({ pan: vendors.pan, gstin: vendors.gstin })
    .from(vendors)
    .where(eq(vendors.id, id))
    .limit(1);
  const short = vendorTdsShortfall({ tdsBp, kind, pan: row?.pan, gstin: row?.gstin });
  if (short === null) return;
  const percent = noPanMinimumBp(kind) / 100;
  throw conflict(
    `${name} has no PAN saved, so TDS must be at least ${percent}% (section 397(2)). Add their PAN on the vendor page, or use at least ${percent}%.`,
  );
}
