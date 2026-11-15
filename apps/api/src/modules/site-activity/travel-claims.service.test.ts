import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '../../common/auth/actor';

const read = vi.hoisted(() => ({ travelDay: vi.fn(), readClaims: vi.fn() }));
const snap = vi.hoisted(() => ({ ensureTravelSnapshot: vi.fn(), tellClaimDeciders: vi.fn() }));

vi.mock('./travel-read', () => read);
vi.mock('../workforce/policy', () => ({ loadPolicy: vi.fn(async () => ({})) }));
vi.mock('../../common/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('@oneohm/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@oneohm/database')>()),
  ...snap,
}));

import { TravelClaimsService } from './travel-claims.service';

const actor = {
  userId: 'u1',
  fullName: 'Ravi',
  kind: 'staff',
  capabilities: new Set(),
} as unknown as Actor;

function insertable() {
  const rows: Record<string, unknown>[] = [];
  const link: unknown = new Proxy(
    {},
    {
      get: (_, key) =>
        key === 'then'
          ? (resolve: (value: unknown[]) => void) => resolve([{ id: 'c1' }])
          : () => link,
    },
  );
  // The locked day read inside the claim's transaction: a closed day.
  const closedDay: unknown = new Proxy(
    {},
    {
      get: (_, key) =>
        key === 'then'
          ? (resolve: (value: unknown[]) => void) => resolve([{ checkOutAt: new Date() }])
          : () => closedDay,
    },
  );
  const db = {
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        rows.push(value);
        return link;
      },
    }),
    select: () => closedDay,
    transaction: async (run: (tx: unknown) => unknown) => run(db),
  };
  return { rows, db };
}

const day = (patch: object = {}) => ({
  workDate: '2026-11-14',
  visits: [{ projectId: 'p1' }],
  legs: [],
  distanceM: 12_000,
  ratePaisePerKm: 700,
  amountPaise: 8400,
  unlocated: 0,
  claim: null,
  closed: true,
  claimable: true,
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  read.readClaims.mockResolvedValue([{ id: 'c1' }]);
});

describe('telling the deciders of a new claim (S10)', () => {
  it('tells the person’s manager, HR or finance, not every leave approver', async () => {
    read.travelDay.mockResolvedValue(day());
    const { db } = insertable();
    await new TravelClaimsService(db as never).claim(actor, '2026-11-14');
    expect(snap.tellClaimDeciders).toHaveBeenCalledWith(
      db,
      'u1',
      expect.objectContaining({
        kind: 'travel_claim',
        subject: { type: 'travel_claim', id: 'c1' },
      }),
    );
  });
});

describe('claiming a day (S3, S5)', () => {
  it('answers 409 "End your day to claim." while the day is still running', async () => {
    read.travelDay.mockResolvedValue(day({ closed: false, claimable: false }));
    const { db, rows } = insertable();
    await expect(
      new TravelClaimsService(db as never).claim(actor, '2026-11-14'),
    ).rejects.toMatchObject({ status: 409, code: 'day_open', message: 'End your day to claim.' });
    expect(rows).toHaveLength(0);
  });

  it('saves the day first when it closed before saving existed, then claims the saved rate', async () => {
    read.travelDay.mockResolvedValue(day({ ratePaisePerKm: 650 }));
    const { db, rows } = insertable();
    await new TravelClaimsService(db as never).claim(actor, '2026-11-14');
    expect(snap.ensureTravelSnapshot).toHaveBeenCalledWith(db, 'u1', '2026-11-14');
    // The rate on the claim is the day's, as the day read it: never read from today's policy here.
    expect(rows[0]).toMatchObject({ ratePaisePerKm: 650, distanceM: 12_000, amountPaise: 8400 });
  });

  it('refuses a day that has not started', async () => {
    const { db } = insertable();
    await expect(
      new TravelClaimsService(db as never).claim(actor, '2999-01-01'),
    ).rejects.toMatchObject({ status: 400 });
  });
});
