import { contractors, vendors } from '@oneohm/database';
import { desc } from 'drizzle-orm';
import { matchRank, matchWords } from '../../common/search-match';
import { type Finder, factsOf, hitOf } from './search-hit';

/** Installation contractors by name, contact person or phone; archived ones last. */
export const findContractors: Finder = async ({ db, words, raw, limit }) => {
  const rows = await db
    .select()
    .from(contractors)
    .where(
      matchWords(words, {
        text: [contractors.name, contractors.contactName],
        phones: [contractors.phoneE164],
      }),
    )
    .orderBy(desc(contractors.active), matchRank(raw, [contractors.name]), contractors.name)
    .limit(limit);
  return rows.map((row) =>
    hitOf('contractors', row.id, row.name, {
      facts: factsOf(row.contactName),
      state: row.active ? 'active' : 'archived',
      phone: row.phoneE164,
    }),
  );
};

/** Vendors by name, contact person, phone or GSTIN; archived ones last. */
export const findVendors: Finder = async ({ db, words, raw, limit }) => {
  const rows = await db
    .select()
    .from(vendors)
    .where(
      matchWords(words, {
        text: [vendors.name, vendors.contactName, vendors.gstin],
        phones: [vendors.phoneE164],
      }),
    )
    .orderBy(desc(vendors.active), matchRank(raw, [vendors.name]), vendors.name)
    .limit(limit);
  return rows.map((row) =>
    hitOf('vendors', row.id, row.name, {
      facts: factsOf(row.contactName),
      state: row.active ? 'active' : 'archived',
      phone: row.phoneE164,
    }),
  );
};
