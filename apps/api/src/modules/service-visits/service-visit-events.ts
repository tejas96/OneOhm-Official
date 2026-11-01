import type { ServiceTicket } from '@oneohm/api-contracts';
import { type DatabaseExecutor, notifyHolders, projectActivities } from '@oneohm/database';
import { queueWhatsApp } from '../../common/outbox';
import { distanceWords, durationWords } from '../site-activity/site-visit-read';

const STATUS_WORDS = { in_progress: 'being worked on', resolved: 'resolved' } as const;

interface Visit {
  readonly visitId: string;
  readonly userId: string;
  readonly fullName: string;
  readonly distanceM: number | null;
  readonly far: boolean | null;
  readonly located: boolean;
}

const subjectOf = (ticket: ServiceTicket) => ({
  type: 'service_request' as const,
  id: ticket.id,
  projectId: ticket.project?.id ?? null,
});

/** Tells the customer the request moved on, as the desk does when it changes the status. */
export async function tellCustomer(
  db: DatabaseExecutor,
  { ticket, topic }: { readonly ticket: ServiceTicket; readonly topic: string },
  status: keyof typeof STATUS_WORDS,
  now: Date,
): Promise<void> {
  await queueWhatsApp(
    db,
    ticket.customer.phone,
    'service_update',
    {
      customer: ticket.customer.name,
      topic,
      status: STATUS_WORDS[status],
    },
    `service:${ticket.id}:${status}:${now.getTime()}`,
  );
}

/** "Checked in for service: Inverter error · 40 m from the site" in the project history. */
export async function noteServiceCheckIn(
  db: DatabaseExecutor,
  ticket: ServiceTicket,
  visit: Visit,
) {
  const where = distanceWords(visit.distanceM, visit.far, visit.located);
  if (ticket.project) {
    await db.insert(projectActivities).values({
      projectId: ticket.project.id,
      kind: 'site_check_in',
      message: `Checked in at the site for service: ${ticket.categoryLabel} · ${where}.`,
      userId: visit.userId,
      data: { visitId: visit.visitId, serviceRequestId: ticket.id, distanceM: visit.distanceM },
    });
  }
  // A far check-in is flagged to the service desk, never refused (PRD 4.3).
  if (visit.far) {
    await notifyHolders(
      db,
      'service.manage',
      {
        kind: 'site_check_in_far',
        title: 'Service check-in far from the site',
        body: `${visit.fullName} · ${ticket.categoryLabel} · ${ticket.customer.name}: ${distanceWords(visit.distanceM, true)}.`,
        subject: subjectOf(ticket),
        dedupeKey: `service_check_in_far:${visit.visitId}`,
      },
      visit.userId,
    );
  }
}

export async function noteServiceCheckOut(
  db: DatabaseExecutor,
  ticket: ServiceTicket,
  visit: Visit & { readonly minutes: number },
) {
  if (!ticket.project) return;
  const away = visit.far ? `, ${distanceWords(visit.distanceM, true)}` : '';
  await db.insert(projectActivities).values({
    projectId: ticket.project.id,
    kind: 'site_check_out',
    message: `Checked out of the site for service: ${ticket.categoryLabel} after ${durationWords(visit.minutes)}${away}.`,
    userId: visit.userId,
    data: { visitId: visit.visitId, serviceRequestId: ticket.id, minutes: visit.minutes },
  });
}

/** The desk hears straight away when a technician hands a request back, with the reason. */
export async function noteHandedBack(
  db: DatabaseExecutor,
  ticket: ServiceTicket,
  by: { readonly userId: string; readonly fullName: string },
  reason: string,
  now: Date,
) {
  await notifyHolders(
    db,
    'service.manage',
    {
      kind: 'service_handed_back',
      title: 'Service request handed back',
      body: `${by.fullName} · ${ticket.categoryLabel} · ${ticket.customer.name}: ${reason.slice(0, 140)}`,
      subject: subjectOf(ticket),
      dedupeKey: `service_handed_back:${ticket.id}:${now.getTime()}`,
    },
    by.userId,
  );
}
