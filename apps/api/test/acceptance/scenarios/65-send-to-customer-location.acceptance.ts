import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { lastReply, replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import {
  actionsOf,
  closeChat,
  lastOf,
  openChat,
  optionsOf,
  sendTo,
  templatesFor,
} from '../support/send';
import { sendInbound } from '../support/whatsapp';

// Ask location (redesign §6, §18): the customer taps the 📍 button and sends a pin. A home with no
// location takes it; a home that has one keeps it and the pin waits as a suggestion; with 2+ homes
// and no ask, "Which home is this location for?".

const point = (property: string) =>
  rows<{ latitude: number | null; source: string | null }>(
    'SELECT latitude, location_source::text AS source FROM properties WHERE id = $1',
    [property],
  ).then(([row]) => row);

describe('Send to customer: ask location', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('sends the 📍 request inside 24 hours; a pin on an empty home is saved as whatsapp_pin and closes the ask', async () => {
    const sale = await sellProject(admin, { name: 'Pin Empty (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    const scope = { projectId: sale.project.id };
    const options = await optionsOf(admin, scope);
    const offer = options.offers.find((one) => one.action === 'ask_location');
    expect(offer?.preview).toMatchObject({
      via: 'chat',
      language: 'en',
      buttons: ['📍 Send location'],
    });
    expect(offer?.preview?.body).toMatch(
      /^Please share the location of your \*.+\* home so our team finds it easily\.$/,
    );
    if (!offer?.request) throw new Error('no offer');
    const sent = await sendTo(admin, scope, offer.request);
    expect(sent.via).toBe('chat');
    const ask = await lastOf(customer.phone, 'location_request');
    expect(ask?.body).toBe(offer.preview?.body);
    const [action] = await actionsOf(customer.customerId, 'location');
    expect(action).toMatchObject({ status: 'open', property_id: customer.propertyId });
    // Asking again while it waits is refused.
    const again = await admin.raw('POST', '/send-to-customer', { scope, request: offer.request });
    expect(again.status).toBe(409);

    await sendInbound(customer.phone, { location: { latitude: 16.8524, longitude: 74.5815 } });
    expect(await point(customer.propertyId)).toMatchObject({
      latitude: 16.8524,
      source: 'whatsapp_pin',
    });
    expect((await actionsOf(customer.customerId, 'location'))[0]?.status).toBe('closed');
    expect((await lastReply(customer.phone))?.body).toMatch(
      /^Thank you ✅ Location saved for your .+ home\.$/,
    );
    const [audit] = await rows(
      "SELECT 1 FROM audit_log WHERE entity = 'property' AND entity_id = $1 AND action = 'property.located'",
      [customer.propertyId],
    );
    expect(audit).toBeDefined();
  });

  it('a home that already has a point keeps it: the pin is a suggestion, staff accept or ignore it', async () => {
    const sale = await sellProject(admin, { name: 'Pin Suggest (test)' });
    const { customer } = sale;
    await rows(
      "UPDATE properties SET latitude = 17.1, longitude = 74.1, location_source = 'gps' WHERE id = $1",
      [customer.propertyId],
    );
    await openChat(customer.phone, customer.customerId);
    const scope = { projectId: sale.project.id };
    await sendTo(admin, scope, { action: 'ask_location', propertyId: customer.propertyId });
    await sendInbound(customer.phone, { location: { latitude: 17.2, longitude: 74.2 } });
    expect(await point(customer.propertyId)).toMatchObject({ latitude: 17.1, source: 'gps' });
    const [action] = await actionsOf(customer.customerId, 'location');
    expect(action?.status).toBe('received');
    expect((await lastReply(customer.phone))?.body).toMatch(/Our team will check it\.$/);
    // The card lists it with the suggestion; the team gets an alert.
    const card = await admin.get<
      { id: string; type: string; suggestion: { distanceM: number } | null }[]
    >(`/document-requests?projectId=${sale.project.id}`);
    const row = card.find((one) => one.id === action?.id);
    expect(row).toMatchObject({ type: 'location' });
    expect(row?.suggestion?.distanceM).toBeGreaterThan(1000);
    const [alert] = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'location_check' AND body LIKE '%already has a location%' LIMIT 1",
    );
    expect(alert).toBeDefined();

    await admin.post(`/customer-actions/${action?.id}/location/accept`);
    expect(await point(customer.propertyId)).toMatchObject({
      latitude: 17.2,
      source: 'whatsapp_pin',
    });
    const [kept] = await rows<{ previous_latitude: number }>(
      'SELECT previous_latitude FROM properties WHERE id = $1',
      [customer.propertyId],
    );
    expect(kept?.previous_latitude).toBe(17.1);
    expect((await actionsOf(customer.customerId, 'location'))[0]?.status).toBe('closed');

    // Ignore: the home keeps its point.
    const second = await sellProject(admin, { name: 'Pin Ignore (test)' });
    await rows(
      "UPDATE properties SET latitude = 18.1, longitude = 75.1, location_source = 'gps' WHERE id = $1",
      [second.customer.propertyId],
    );
    await openChat(second.customer.phone, second.customer.customerId);
    await sendInbound(second.customer.phone, { location: { latitude: 18.3, longitude: 75.3 } });
    const [pending] = await actionsOf(second.customer.customerId, 'location');
    expect(pending?.status).toBe('received');
    await admin.post(`/customer-actions/${pending?.id}/location/ignore`);
    expect(await point(second.customer.propertyId)).toMatchObject({
      latitude: 18.1,
      source: 'gps',
    });
    expect((await actionsOf(second.customer.customerId, 'location'))[0]?.status).toBe('closed');
  });

  it('with 2 homes and no ask, "Which home is this location for?" then the tap saves it there', async () => {
    const sale = await sellProject(admin, { name: 'Pin Two Homes (test)' });
    const farm = await anotherHome(admin, sale.customer, 'Farm (test)');
    await openChat(sale.customer.phone, sale.customer.customerId);
    await sendInbound(sale.customer.phone, { location: { latitude: 16.9, longitude: 74.6 } });
    const list = await lastOf(sale.customer.phone, 'list');
    expect(list?.body).toBe('Which home is this location for?');
    const row = list?.rows?.find((one) => one.id.endsWith(farm.propertyId));
    expect(row).toBeDefined();
    expect(list?.rows).toHaveLength(2);
    await tap(sale.customer.phone, row?.id ?? '');
    expect(await point(farm.propertyId)).toMatchObject({ latitude: 16.9, source: 'whatsapp_pin' });
    expect(await point(sale.customer.propertyId)).toMatchObject({ latitude: null });
    expect((await lastReply(sale.customer.phone))?.body).toMatch(
      /Location saved for your Farm \(test\) home\./,
    );
    // The same tap again is an old message, not a second save.
    await tap(sale.customer.phone, row?.id ?? '');
    expect((await lastReply(sale.customer.phone))?.body).toMatch(/earlier message/);
  });

  it('outside 24 hours the approved template goes; its button opens the chat step that sends the 📍 request', async () => {
    const sale = await sellProject(admin, { name: 'Pin Template (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    await closeChat(customer.phone);
    const scope = { projectId: sale.project.id };
    const offer = (await optionsOf(admin, scope)).offers.find(
      (one) => one.action === 'ask_location',
    );
    expect(offer?.preview).toMatchObject({ via: 'template' });
    expect(offer?.preview?.note).toMatch(/not switched on yet/);
    if (!offer?.request) throw new Error('no offer');
    expect((await sendTo(admin, scope, offer.request)).via).toBe('template');
    const [message] = await templatesFor(customer.phone, 'location_request');
    const [action] = await actionsOf(customer.customerId, 'location');
    expect(message?.payload).toMatchObject({ locationPayload: `locreq:${action?.id}` });
    expect(await lastOf(customer.phone, 'location_request')).toBeUndefined();
    // The customer taps the template button: now the chat is open and the 📍 request goes.
    await sendInbound(customer.phone, { buttonPayload: `locreq:${action?.id}` });
    expect((await lastOf(customer.phone, 'location_request'))?.body).toMatch(
      /^Please share the location/,
    );
  });

  it('the words follow the customer language and cancel tells the customer', async () => {
    const sale = await sellProject(admin, { name: 'Pin Marathi (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    await tap(customer.phone, 'lang:mr');
    const scope = { projectId: sale.project.id };
    await sendTo(admin, scope, { action: 'ask_location', propertyId: customer.propertyId });
    expect((await lastOf(customer.phone, 'location_request'))?.body).toMatch(
      /^कृपया तुमच्या \*.+\* घराचे लोकेशन पाठवा/,
    );
    const [action] = await actionsOf(customer.customerId, 'location');
    await admin.post(`/document-requests/${action?.id}/cancel`);
    expect((await actionsOf(customer.customerId, 'location'))[0]?.status).toBe('cancelled');
    const told = (await replies(customer.phone)).at(-1);
    expect(told?.body).toMatch(/लोकेशन पाठवण्याची आता गरज नाही/);
    // A pin after the cancel is still kept (customer's own), not an error.
    await sendInbound(customer.phone, { location: { latitude: 16.0, longitude: 74.0 } });
    expect(await point(customer.propertyId)).toMatchObject({ latitude: 16 });
  });
});
