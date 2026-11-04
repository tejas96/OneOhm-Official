import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { chatOf, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { askAboutFiles } from '../support/what-is-this';
import { sendInbound } from '../support/whatsapp';

// The chat shows under each file where it was filed, or that it is still to sort.

interface ChatMessageRow {
  readonly direction: string;
  readonly file: { id: string; filedAs: string | null } | null;
}

async function filedAsOfFiles(admin: Session, phone: string) {
  const chat = await chatOf(phone);
  const detail = await admin.get<{ messages: ChatMessageRow[] }>(`/whatsapp/chats/${chat.id}`);
  return detail.messages
    .filter((row) => row.direction === 'in' && row.file)
    .map((row) => row.file?.filedAs);
}

describe('Papers per home: chat label', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('chat shows where a file was filed', async () => {
    const { customer } = await sellProject(admin, { name: 'Label One (test)' });
    const [home] = await rows<{ label: string | null; city: string }>(
      'SELECT label, city FROM properties WHERE id = $1',
      [customer.propertyId],
    );
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'label-one-1' } });
    // Not said what it is yet: still to sort.
    expect(await filedAsOfFiles(admin, customer.phone)).toEqual([null]);
    await askAboutFiles(admin);
    await tap(customer.phone, 'what:other');
    expect(await filedAsOfFiles(admin, customer.phone)).toEqual([
      `Other · ${home?.label ?? home?.city}`,
    ]);

    const { customer: two } = await sellProject(admin, { name: 'Label Two (test)' });
    const farm = await anotherHome(admin, two, 'Farm (test)');
    await sendInbound(two.phone, { media: { type: 'image', fileId: 'label-two-1' } });
    await askAboutFiles(admin);
    await tap(two.phone, 'what:other');
    expect(await filedAsOfFiles(admin, two.phone)).toEqual([null]);
    await tap(two.phone, `where:${farm.propertyId}`);
    expect(await filedAsOfFiles(admin, two.phone)).toEqual(['Other · Farm (test)']);
  });
});
