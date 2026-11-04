import {
  customers,
  leads,
  projects,
  projectWords,
  properties,
  serviceRequests,
  type Transaction,
} from '@oneohm/database';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { queueWhatsApp } from '../../../common/outbox';
import { formatPhone } from '../../reports/quotation-document';
import { firstNameOf } from '../person-invite';
import type { OpenWork } from './departure-work';

interface Recipient {
  readonly phone: string;
  readonly name: string;
  readonly subject: string;
}

/** One customer to tell, from the work the leaver held, in the order of the three kinds. */
async function recipientsOf(tx: Transaction, work: OpenWork): Promise<Recipient[]> {
  const found: Recipient[] = [];
  if (work.managedProjects.length > 0) {
    const rows = await tx
      .select({
        phone: customers.phoneE164,
        name: customers.name,
        code: projects.code,
        city: properties.city,
        capacityWp: projects.capacityWp,
      })
      .from(projects)
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .innerJoin(properties, eq(properties.id, projects.propertyId))
      .where(inArray(projects.id, [...work.managedProjects]))
      .orderBy(asc(projects.createdAt), asc(projects.id));
    for (const row of rows) {
      found.push({
        phone: row.phone,
        name: row.name,
        subject: `your solar project (${projectWords(row)})`,
      });
    }
  }
  if (work.serviceRequests.length > 0) {
    const rows = await tx
      .select({ phone: customers.phoneE164, name: customers.name })
      .from(serviceRequests)
      .innerJoin(customers, eq(customers.id, serviceRequests.customerId))
      .where(inArray(serviceRequests.id, [...work.serviceRequests]))
      .orderBy(asc(serviceRequests.createdAt), asc(serviceRequests.id));
    for (const row of rows) found.push({ ...row, subject: 'your service request' });
  }
  if (work.leads.length > 0) {
    // A lead still in `new` has not been contacted yet, so does not know anyone to be told about.
    const rows = await tx
      .select({ phone: leads.phoneE164, name: leads.name })
      .from(leads)
      .where(and(inArray(leads.id, [...work.leads]), ne(leads.stage, 'new')))
      .orderBy(asc(leads.createdAt), asc(leads.id));
    for (const row of rows) found.push({ ...row, subject: 'your solar enquiry' });
  }
  return found;
}

/**
 * Tells each customer of the person leaving who their new contact is: one WhatsApp
 * message per phone number (the first reason found is the subject), queued in the
 * removal's own transaction. Reads the leaver's work as it was before the handover.
 * Returns how many messages were queued.
 */
export async function tellCustomers(
  tx: Transaction,
  leaverId: string,
  target: { readonly fullName: string; readonly phoneE164: string | null },
  work: OpenWork,
): Promise<number> {
  // The message tells the customer which number to call; with no number there is nothing to say.
  if (!target.phoneE164) return 0;
  const staff = firstNameOf(target.fullName);
  const phone = formatPhone(target.phoneE164);
  const seen = new Set<string>();
  for (const person of await recipientsOf(tx, work)) {
    if (seen.has(person.phone)) continue;
    seen.add(person.phone);
    await queueWhatsApp(
      tx,
      person.phone,
      'contact_changed',
      { customer: person.name, staff, subject: person.subject, phone },
      `contact_changed:${leaverId}:${person.phone}`,
    );
  }
  return seen.size;
}
