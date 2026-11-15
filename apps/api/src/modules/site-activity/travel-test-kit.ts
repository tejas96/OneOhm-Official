import { chain } from './site-visit-test-kit';

/**
 * A transaction double: each `select()` answers the next queued result in order, `insert()`
 * answers its own queue, and every `update(table).set(values)` is recorded.
 */
export function scripted(selects: unknown[][], inserts: unknown[][] = []) {
  const updates: { table: unknown; set: Record<string, unknown> }[] = [];
  const tx = {
    select: () => chain(selects.shift() ?? []),
    insert: () => ({ values: () => chain(inserts.shift() ?? [{ id: 'new' }]) }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => {
        updates.push({ table, set });
        return chain([]);
      },
    }),
    transaction: async <T>(run: (inner: unknown) => Promise<T>) => run(tx),
  };
  return { tx, updates };
}
