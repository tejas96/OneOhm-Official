import type { Database } from '../client';
import { stockLocations } from '../schema';

/** The main store every receipt lands in by default; more locations can be added later. */
export const MAIN_STORE_CODE = 'MAIN';

export async function seedStockLocations(db: Database): Promise<void> {
  await db
    .insert(stockLocations)
    .values({ code: MAIN_STORE_CODE, name: 'Main store' })
    .onConflictDoNothing({ target: stockLocations.code });
}
