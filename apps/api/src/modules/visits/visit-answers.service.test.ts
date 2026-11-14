import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VisitAnswersService } from './visit-answers.service';

const { say, cancel, confirmed, alert } = vi.hoisted(() => ({
  say: vi.fn(async () => undefined),
  cancel: vi.fn(async () => undefined),
  confirmed: vi.fn(async () => undefined),
  alert: vi.fn(async () => undefined),
}));
vi.mock('../whatsapp/assistant/closing-taps', () => ({ sayWithTaps: say }));
vi.mock('../whatsapp/chat-owner', () => ({ answererName: async () => 'Asha' }));
vi.mock('./visit-store', () => ({ cancelVisit: cancel, customerConfirmed: confirmed }));
vi.mock('./visit-effects', () => ({ logVisit: vi.fn() }));
vi.mock('./visit-reads', () => ({
  scopeOfRow: () => ({}),
  targetOf: async () => ({ title: 'Site survey', customerName: 'Ravi', home: 'Pune' }),
}));
vi.mock('@oneohm/database', async (original) => ({
  ...((await original()) as object),
  alertVisitOwner: alert,
}));

const ID = '0b6f1c7e-7d3a-4f0e-9c1d-2a4b5c6d7e8f';
const chat = { id: 'c1', phone: '+919800000001', customerId: null } as never;

function visit(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    kind: 'survey',
    status: 'confirmed',
    day: '2026-11-20',
    slot: 'morning',
    leadId: 'l1',
    customerId: null,
    customerConfirmedAt: null,
    ...over,
  };
}

function service(found: unknown) {
  const query = {
    from: () => query,
    leftJoin: () => query,
    where: async () => (found ? [found] : []),
  };
  const tx = { update: vi.fn(), insert: vi.fn() };
  const db = { select: () => query, transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
  const picks = { old: vi.fn(async () => undefined), list: vi.fn() };
  return { svc: new VisitAnswersService(db as never, picks as never), picks };
}

const lead = (over: Record<string, unknown> = {}) => ({
  visit: visit(),
  leadPhone: '+919800000001',
  leadCustomerId: null,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('a lead taps a visit button (no customer yet)', () => {
  it('[Okay] on its own survey is logged and thanked', async () => {
    const { svc } = service(lead());
    expect(await svc.tappedByLead(chat, { t: 'okay', visitId: ID })).toBe(true);
    expect(confirmed).toHaveBeenCalledOnce();
    expect(say).toHaveBeenCalledOnce();
  });

  it('[Confirm] already confirmed is thanked without logging twice', async () => {
    const { svc } = service(lead({ visit: visit({ customerConfirmedAt: new Date() }) }));
    expect(await svc.tappedByLead(chat, { t: 'confirm', visitId: ID })).toBe(true);
    expect(confirmed).not.toHaveBeenCalled();
    expect(say).toHaveBeenCalledOnce();
  });

  it('[Change day] cancels the survey and alerts its owner, with no pick ask made', async () => {
    const { svc } = service(lead());
    expect(await svc.tappedByLead(chat, { t: 'change', visitId: ID })).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(alert).toHaveBeenCalledOnce();
    expect(say).toHaveBeenCalledOnce();
  });

  it('a visit of another person (other phone, other customer) is not touched', async () => {
    const { svc } = service(lead({ leadPhone: '+919811111111' }));
    for (const t of ['okay', 'confirm', 'change'] as const)
      expect(await svc.tappedByLead(chat, { t, visitId: ID })).toBe(false);
    expect(confirmed).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(say).not.toHaveBeenCalled();
  });

  it("a visit with no lead (a customer's task visit) is not touched", async () => {
    const { svc } = service(
      lead({ visit: visit({ leadId: null, customerId: 'cu1' }), leadPhone: null }),
    );
    expect(await svc.tappedByLead(chat, { t: 'okay', visitId: ID })).toBe(false);
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('a visit that does not exist is left to the stranger reply', async () => {
    const { svc } = service(null);
    expect(await svc.tappedByLead(chat, { t: 'okay', visitId: ID })).toBe(false);
  });

  it.each(['cancelled', 'done'])('a %s visit hears "an earlier message"', async (status) => {
    const { svc, picks } = service(lead({ visit: visit({ status }) }));
    expect(await svc.tappedByLead(chat, { t: 'okay', visitId: ID })).toBe(true);
    expect(picks.old).toHaveBeenCalledOnce();
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('a stale [Change day] after the visit moved changes nothing', async () => {
    const { svc } = service(lead());
    await svc.tappedByLead(chat, { t: 'change', visitId: ID, day: '2026-11-18' });
    expect(cancel).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    expect(say).toHaveBeenCalledOnce();
  });

  it("pick taps are not a lead's (no ask exists without a customer)", async () => {
    const { svc } = service(lead());
    expect(await svc.tappedByLead(chat, { t: 'ask', actionId: ID })).toBe(false);
    expect(await svc.tappedByLead(chat, { t: 'day', actionId: ID, day: '2026-11-20' })).toBe(false);
  });
});

describe('the lead became a customer later', () => {
  const customer = { id: 'c1', phone: '+919800000001', customerId: 'cu1' } as never;

  it('[Okay] works on a visit booked while it was a lead', async () => {
    const { svc } = service(lead({ leadPhone: '+919822222222', leadCustomerId: 'cu1' }));
    await svc.tapped(customer, 'cu1', { t: 'okay', visitId: ID });
    expect(confirmed).toHaveBeenCalledOnce();
  });

  it("another customer's visit is not theirs", async () => {
    const { svc, picks } = service(
      lead({
        visit: visit({ customerId: 'other' }),
        leadPhone: '+919833333333',
        leadCustomerId: 'x',
      }),
    );
    await svc.tapped(customer, 'cu1', { t: 'okay', visitId: ID });
    expect(confirmed).not.toHaveBeenCalled();
    expect(picks.old).toHaveBeenCalledOnce();
  });
});
