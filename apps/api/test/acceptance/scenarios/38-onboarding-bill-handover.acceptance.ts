import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { objectExists } from '../support/objects';
import {
  chatOf,
  handOverAlerts,
  leadsOf,
  say,
  tap,
  upToSite,
  withOnboarding,
} from '../support/onboarding';
import { today, uniquePhone } from '../support/sales';
import { sendInbound } from '../support/whatsapp';

// Part 3, task 6 (fix round 1): a held bill is never stranded. A hand-over before the city
// makes the lead first and files the bill on it; a replaced held photo is removed; a bill
// after the estimate is filed and tells the owner.
const docsOf = (leadId: string) =>
  rows<{ id: string }>('SELECT id FROM documents WHERE lead_id = $1', [leadId]);
const photo = (phone: string, fileId = 'bill-1') =>
  sendInbound(phone, { media: { type: 'image', fileId, mimeType: 'image/jpeg' } });

describe('Held bills and hand-overs', () => {
  let admin: Session;
  let restore: () => Promise<void>;

  beforeAll(async () => {
    admin = await Session.admin();
    restore = await withOnboarding(admin, { enabled: true, serviceCities: ['Pune'] });
  });
  afterAll(async () => {
    await restore();
    await closeDb();
  });

  const pendingKey = async (phone: string) =>
    ((await chatOf(phone)).ob as { pendingFile?: { storageKey: string } } | null)?.pendingFile
      ?.storageKey;

  it('keeps only the newest photo sent before the lead and removes the older object', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:en');
    await photo(phone, 'bill-1');
    const first = await pendingKey(phone);
    await photo(phone, 'bill-2');
    const second = await pendingKey(phone);
    expect(first && second && first !== second).toBe(true);
    expect(await objectExists(first ?? '')).toBe(false);
    expect(await objectExists(second ?? '')).toBe(true);
    await tap(phone, 'ob:name:yes');
    await tap(phone, 'ob:city:Pune');
    const [lead] = await leadsOf(phone);
    expect(await docsOf(lead?.id ?? '')).toHaveLength(1);
    expect(await objectExists(second ?? '')).toBe(false);
  });

  it('makes the lead, files the held photo and alerts the owner on "Talk to a person"', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:en');
    await photo(phone);
    await tap(phone, 'ob:person');
    const [lead] = await leadsOf(phone);
    expect(lead).toMatchObject({ city: 'Not given', source: 'whatsapp' });
    expect(lead?.next_action_on).toBe(today());
    expect(lead?.next_action_note).toContain('asked for a person');
    expect(await docsOf(lead?.id ?? '')).toHaveLength(1);
    const chat = await chatOf(phone);
    expect(chat.state).toBe('human');
    expect(chat.ob).not.toHaveProperty('pendingFile');
    expect((await handOverAlerts(chat.id)).length).toBeGreaterThan(0);
  });

  it('makes the lead and alerts the owner after a second unclear answer', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await say(phone, 'blah');
    expect(await leadsOf(phone)).toEqual([]);
    await say(phone, 'blah blah');
    const [lead] = await leadsOf(phone);
    expect(lead?.city).toBe('Not given');
    const chat = await chatOf(phone);
    expect(chat.state).toBe('human');
    expect((await handOverAlerts(chat.id)).length).toBeGreaterThan(0);
  });

  it('files a bill sent after the estimate and alerts the owner', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await tap(phone, 'ob:site:home');
    await tap(phone, 'ob:bill:2000_3000');
    await tap(phone, 'ob:roof:rcc');
    await tap(phone, 'ob:floors:1');
    await tap(phone, 'ob:photo:later');
    const [lead] = await leadsOf(phone);
    const chat = await chatOf(phone);
    const before = (await handOverAlerts(chat.id)).length;
    await photo(phone);
    expect(await docsOf(lead?.id ?? '')).toHaveLength(1);
    const alerts = await handOverAlerts(chat.id);
    expect(alerts.length).toBeGreaterThan(before);
    expect(alerts.some((alert) => alert.body.includes('New bill received'))).toBe(true);
    expect((await chatOf(phone)).state).toBe('onboard:done');
  });
});
