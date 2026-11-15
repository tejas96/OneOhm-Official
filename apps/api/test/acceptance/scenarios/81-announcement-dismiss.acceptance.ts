import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../support/db';
import { Session } from '../support/http';
import { STAFF } from '../support/team';

// Each person can close an announcement; it stays for everyone else (PRD 4.1).

interface Notice {
  id: string;
  title: string;
}

const shown = async (who: Session, id: string) =>
  (await who.get<Notice[]>('/me/announcements')).some((notice) => notice.id === id);

describe('Announcements: closing one', () => {
  let admin: Session;
  let sales: Session;
  beforeAll(async () => {
    admin = await Session.admin();
    sales = await Session.code(STAFF.sales.phone);
  });
  afterAll(closeDb);

  it('a closed announcement leaves that person only, and closing twice is fine', async () => {
    const notice = await admin.post<Notice>('/announcements', {
      title: 'Dismiss me (test)',
      body: 'Office closes early on Friday.',
      audienceRoleKeys: [],
      endsOn: null,
    });
    expect(await shown(sales, notice.id)).toBe(true);
    expect(await shown(admin, notice.id)).toBe(true);

    const first = await sales.raw('POST', `/me/announcements/${notice.id}/dismiss`);
    expect(first.status).toBe(204);
    const again = await sales.raw('POST', `/me/announcements/${notice.id}/dismiss`);
    expect(again.status).toBe(204);

    expect(await shown(sales, notice.id)).toBe(false);
    expect(await shown(admin, notice.id)).toBe(true);
    const listed = await admin.get<Notice[]>('/announcements');
    expect(listed.some((item) => item.id === notice.id)).toBe(true);
  });

  it('an announcement that does not exist is a 404', async () => {
    const reply = await sales.raw('POST', `/me/announcements/${randomUUID()}/dismiss`);
    expect(reply.status).toBe(404);
  });
});
