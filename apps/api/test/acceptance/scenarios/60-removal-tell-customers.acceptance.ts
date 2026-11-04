import type { CustomerHome } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { sellProject, today, uniquePhone } from '../support/sales';

// Removing someone can tell each customer who their new contact is (spec, Customer
// communication): one WhatsApp message per phone number, never to a lead nobody has
// contacted yet, and none at all when the admin turns the box off.
const TAG = 'tell customers (test)';

describe('removal tells customers', () => {
  let admin: Session;
  const people: OwnPerson[] = [];
  const person = async (name: string) => {
    const made = await ownPerson(admin, name);
    people.push(made);
    return made;
  };
  let leaver: OwnPerson;
  let target: OwnPerson;
  let quiet: OwnPerson;
  let projectCustomer: { phone: string; customerId: string };
  let contactedPhone = '';
  let newLeadPhone = '';
  let quietPhone = '';
  let stoppedPhone = '';
  let stoppedCustomerId = '';

  const lead = async (stage: string, ownerId: string) => {
    const phone = uniquePhone();
    const made = await admin.post<{ id: string }>('/leads', {
      name: `Lead ${stage} (${TAG})`,
      phone,
      city: 'Sangli',
      subsidyCategory: 'individual',
      nextActionOn: today(),
    });
    await rows('UPDATE leads SET owner_user_id = $2, stage = $3 WHERE id = $1', [
      made.id,
      ownerId,
      stage,
    ]);
    return phone;
  };
  const remove = (from: OwnPerson, to: OwnPerson, tellCustomers: boolean) =>
    admin.post(`/people/${from.id}/remove`, {
      handToUserId: to.id,
      lastWorkingDay: today(),
      tellCustomers,
    });

  beforeAll(async () => {
    admin = await Session.admin();
    leaver = await person('Leaver Lata (tell test)');
    target = await person('Target Tara (tell test)');
    quiet = await person('Quiet Quinn (tell test)');

    // One customer holds both a project and a service request with the leaver.
    const sale = await sellProject(admin, {
      name: 'Tell Project (test)',
      managerUserId: leaver.id,
    });
    projectCustomer = sale.customer;
    await rows(
      `INSERT INTO service_requests (customer_id, project_id, category, description, assignee_user_id)
       VALUES ($1, $2, 'inverter_fault', $3, $4)`,
      [sale.customer.customerId, sale.created.id, TAG, leaver.id],
    );
    contactedPhone = await lead('contacted', leaver.id);
    newLeadPhone = await lead('new', leaver.id);

    // A second leaver, removed with the box off.
    const quietSale = await sellProject(admin, {
      name: 'Quiet Project (test)',
      managerUserId: quiet.id,
    });
    quietPhone = quietSale.customer.phone;
    // A customer who sent STOP is not messaged by WhatsApp or SMS, but still sees the news in the app.
    const stopped = await sellProject(admin, {
      name: 'Stopped Project (test)',
      managerUserId: leaver.id,
    });
    stoppedPhone = stopped.customer.phone;
    stoppedCustomerId = stopped.customer.customerId;
    await rows('UPDATE customers SET whatsapp_opt_in = false WHERE id = $1', [stoppedCustomerId]);
    await remove(quiet, target, false);
    await remove(leaver, target, true);
  });

  afterAll(async () => {
    await rows('DELETE FROM service_requests WHERE description = $1', [TAG]);
    await retire(admin, people);
    await closeDb();
  });

  const contactMessages = async (phone: string) =>
    (await outboxFor(phone)).filter((row) => row.template === 'contact_changed');

  it('sends one message per customer phone even with a project and a service request', async () => {
    const sent = await contactMessages(projectCustomer.phone);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.channel).toBe('whatsapp');
    expect(sent[0]?.dedupe_key).toBe(`contact_changed:${leaver.id}:${projectCustomer.phone}`);
    // The project came first, so it is the subject; the contact is the first name and number.
    expect(sent[0]?.payload).toMatchObject({
      staff: 'Target',
      subject: expect.stringContaining('your solar project'),
    });
    expect(sent[0]?.payload.phone).toMatch(/^\+91 \d{5} \d{5}$/);
  });

  it('tells a lead that has been contacted, but not one still in stage new', async () => {
    const contacted = await contactMessages(contactedPhone);
    expect(contacted).toHaveLength(1);
    expect(contacted[0]?.payload.subject).toBe('your solar enquiry');
    expect(await contactMessages(newLeadPhone)).toHaveLength(0);
  });

  it('queues nothing when tellCustomers is false', async () => {
    expect(await contactMessages(quietPhone)).toHaveLength(0);
  });

  it('respects STOP: no WhatsApp or SMS, but the app inbox still has the news', async () => {
    expect(await contactMessages(stoppedPhone)).toHaveLength(0);
    const inbox = await rows<{ kind: string }>(
      "SELECT kind FROM notifications WHERE customer_id = $1 AND kind = 'contact_changed'",
      [stoppedCustomerId],
    );
    expect(inbox).toHaveLength(1);
  });

  it('the customer home shows the new manager name', async () => {
    const app = await Session.code(projectCustomer.phone, 'customer');
    const home = await app.get<CustomerHome>('/customer/home');
    expect(home.projects[0]?.contact?.name).toBe(target.name);
  });
});
