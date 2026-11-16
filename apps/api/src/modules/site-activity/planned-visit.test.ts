import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ finishVisit: vi.fn() }));
// The same step finishing a task runs; it is stubbed so no customer message can go out.
vi.mock('../visits/visit-store', () => store);

import { finishLinkedVisit, plannedVisitFor } from './planned-visit';

/** A query whose awaited result, and `.limit()` result, is `rows`. */
function selecting(rows: unknown[]) {
  const link: unknown = new Proxy(
    {},
    {
      get: (_, key) =>
        key === 'then' ? (resolve: (value: unknown[]) => void) => resolve(rows) : () => link,
    },
  );
  return { select: vi.fn(() => link) } as never;
}

beforeEach(() => vi.clearAllMocks());

describe('finishLinkedVisit (S6)', () => {
  it('marks a confirmed planned visit done, the same way finishing the task does', async () => {
    const row = { id: 'pv', status: 'confirmed' };
    const db = selecting([row]);
    await finishLinkedVisit(db, 'pv', 'u1', 'Panel installation');
    expect(store.finishVisit).toHaveBeenCalledWith(db, row, 'u1', 'Panel installation');
  });

  it.each(['proposed', 'done', 'missed', 'cancelled'])(
    'leaves a %s visit alone',
    async (status) => {
      await finishLinkedVisit(selecting([{ id: 'pv', status }]), 'pv', 'u1', 'x');
      expect(store.finishVisit).not.toHaveBeenCalled();
    },
  );

  it('does nothing when the check-in was not linked to a planned visit', async () => {
    const db = selecting([]);
    await finishLinkedVisit(db, null, 'u1', 'x');
    expect((db as unknown as { select: unknown }).select).not.toHaveBeenCalled();
    expect(store.finishVisit).not.toHaveBeenCalled();
  });
});

describe('plannedVisitFor (S6)', () => {
  it('links the confirmed visit of that day for the task or request', async () => {
    const rows = [
      { id: 'a', status: 'proposed', day: '2026-11-15' },
      { id: 'b', status: 'confirmed', day: '2026-11-15' },
    ];
    expect(await plannedVisitFor(selecting(rows), { taskId: 't' }, '2026-11-15')).toBe('b');
    expect(await plannedVisitFor(selecting(rows), { serviceRequestId: 's' }, '2026-11-15')).toBe(
      'b',
    );
  });

  it('links nothing when none is planned that day', async () => {
    expect(await plannedVisitFor(selecting([]), { taskId: 't' }, '2026-11-15')).toBeNull();
  });
});
