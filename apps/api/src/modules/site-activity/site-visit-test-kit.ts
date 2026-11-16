import { vi } from 'vitest';
import type { Actor } from '../../common/auth/actor';

/** Every query method returns the same object; awaiting it gives `rows`. */
export function chain(rows: unknown[]) {
  const link: unknown = new Proxy(
    {},
    {
      get: (_, key) =>
        key === 'then' ? (resolve: (value: unknown[]) => void) => resolve(rows) : () => link,
    },
  );
  return link;
}

export const actor = (userId: string, capabilities: string[] = []) =>
  ({
    userId,
    fullName: userId,
    kind: 'staff',
    capabilities: new Set(capabilities),
  }) as unknown as Actor;

export const task = (assigneeUserId: string) => ({
  id: 't1',
  title: 'Panel installation',
  status: 'in_progress',
  assigneeUserId,
  projectId: 'p1',
  projectCode: 'P-1',
  managerUserId: 'pm',
  propertyId: 'prop',
  siteLabel: 'Home',
  siteAddress: 'Road',
  site: null,
  siteSource: null,
  siteFlagged: false,
  kind: 'installation',
});

export interface Harness {
  readonly db: Record<string, unknown>;
  readonly tx: Record<string, unknown>;
  readonly inserted: Record<string, unknown>[];
  readonly updated: Record<string, unknown>[];
  readonly selects: unknown[][];
  readonly txSelects: unknown[][];
  readonly transaction: ReturnType<typeof vi.fn>;
}

export function harness(): Harness {
  const inserted: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  const selects: unknown[][] = [];
  const txSelects: unknown[][] = [];
  const tx = {
    select: vi.fn(() => chain(txSelects.shift() ?? [])),
    insert: vi.fn(() => ({
      values: (value: Record<string, unknown>) => {
        inserted.push(value);
        return chain([{ id: 'new-visit' }]);
      },
    })),
    update: vi.fn(() => ({
      set: (value: Record<string, unknown>) => {
        updated.push(value);
        return chain([{ id: 'v1' }]);
      },
    })),
  };
  const transaction = vi.fn(async (work: (handle: typeof tx) => unknown) => work(tx));
  const db = { select: vi.fn(() => chain(selects.shift() ?? [])), transaction };
  return { db, tx, inserted, updated, selects, txSelects, transaction };
}

export const open = {
  id: 'v1',
  userId: 'u1',
  taskId: 't1',
  projectId: 'p1',
  visitId: 'planned-1',
  serviceRequestId: null,
  propertyId: 'prop',
  checkInAt: new Date('2026-11-15T05:00:00Z'),
  checkOutAt: null,
};
