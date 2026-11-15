import { beforeEach, describe, expect, it, vi } from 'vitest';

const notifyStaffHolders = vi.hoisted(() => vi.fn(async () => 1));
vi.mock('@oneohm/database', async (original) => ({
  ...(await original<object>()),
  notifyStaffHolders,
}));

import { PermanentEventError } from './event-flow';
import { alertGiveUp, alertNoPhone, alertTestLead } from './lead-alerts';

const lead = { platform: 'google', name: 'Ravi', phone: '98', platformLeadId: '1' } as never;
beforeEach(() => vi.clearAllMocks());
const notice = () => (notifyStaffHolders.mock.calls[0] as unknown[])[2] as Record<string, unknown>;

describe('lead desk alerts', () => {
  it('says which platform, who, and what was given', async () => {
    await alertNoPhone({} as never, lead, { id: 'c1' } as never, 'google:lead:1');
    expect(notice()).toMatchObject({
      body: 'A Google lead form entry from Ravi had no Indian mobile number: 98. Call or check it in the ad platform.',
      subject: { type: 'marketing', id: 'c1' },
      dedupeKey: 'form_no_phone:google:lead:1',
    });
  });

  it('marks a test lead clearly', async () => {
    await alertTestLead({} as never, lead, 'google:lead:1');
    expect(notice().title).toBe('Test lead received from Google — the connection works.');
  });

  it('tells the desk once about a form entry that could not be read', async () => {
    await alertGiveUp(
      {} as never,
      new PermanentEventError('Meta is not connected'),
      'k',
      'Meta lead form entry',
    );
    expect(notice().body).toBe(
      'A Meta lead form entry could not be read: Meta is not connected. Open Marketing → Connections.',
    );
  });

  it('says nobody can take leads', async () => {
    await alertGiveUp(
      {} as never,
      new PermanentEventError('x', 'nobody'),
      'k',
      'Meta lead form entry',
    );
    expect(notice().title).toBe('A lead came in but nobody can take leads');
  });
});
