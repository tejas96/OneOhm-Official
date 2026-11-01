import type { Product } from '@oneohm/api-contracts';
import { type DatabaseExecutor, documents, type products } from '@oneohm/database';
import { inArray } from 'drizzle-orm';

type ProductRow = typeof products.$inferSelect;

/** Datasheets are filed like company assets: anyone signed in may open them. */
export const DATASHEET_CATEGORY = 'company_datasheet';

/** Products as the API shows them, with specifications and the datasheet's name. */
export async function productViews(
  db: DatabaseExecutor,
  rows: readonly ProductRow[],
): Promise<Product[]> {
  const ids = rows.flatMap((row) => row.datasheetDocumentId ?? []);
  const sheets =
    ids.length > 0
      ? await db
          .select({ id: documents.id, name: documents.name })
          .from(documents)
          .where(inArray(documents.id, ids))
      : [];
  return rows.map(({ createdAt: _created, updatedAt: _updated, datasheetDocumentId, ...row }) => ({
    ...row,
    datasheet: sheets.find((sheet) => sheet.id === datasheetDocumentId) ?? null,
  }));
}
