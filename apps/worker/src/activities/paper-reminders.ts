import {
  askForPaper,
  chatOwnerFor,
  customerHomes,
  customers,
  type Database,
  documentRequests,
  documents,
  notifyCover,
  notifyHolders,
  projects,
  reaskRound,
  tellChatTeam,
  waConversations,
  waMessages,
} from '@oneohm/database';
import { and, asc, eq, isNull, lte } from 'drizzle-orm';

const HOUR = 3_600_000;
/** The customer is reminded once after 2 days, the asker told once after 4 (per ask). */
const CUSTOMER_AFTER = 48 * HOUR;
const TEAM_AFTER = 96 * HOUR;
/** Files a customer sent that nobody has put on a home yet are chased after 2 hours. */
const SORT_AFTER = 2 * HOUR;

/** What an open request is due for, counted from the latest time the customer was asked. */
export function paperReminderDue(askedAt: Date, now: Date): 'customer' | 'team' | null {
  const age = now.getTime() - askedAt.getTime();
  if (age >= TEAM_AFTER) return 'team';
  return age >= CUSTOMER_AFTER ? 'customer' : null;
}

/** Open requests: remind the customer at 2 days, tell the asker at 4. Each once per ask. */
async function remindOpenRequests(db: Database, now: Date): Promise<number> {
  const open = await db
    .select({
      id: documentRequests.id,
      title: documentRequests.title,
      projectId: documentRequests.projectId,
      projectCode: projects.code,
      managerUserId: projects.managerUserId,
      requestedByUserId: documentRequests.requestedByUserId,
      askedAt: documentRequests.createdAt,
      customer: customers.name,
      phone: customers.phoneE164,
    })
    .from(documentRequests)
    .innerJoin(customers, eq(customers.id, documentRequests.customerId))
    .leftJoin(projects, eq(projects.id, documentRequests.projectId))
    .where(
      and(
        eq(documentRequests.status, 'open'),
        lte(documentRequests.createdAt, new Date(now.getTime() - CUSTOMER_AFTER)),
      ),
    );
  let done = 0;
  for (const request of open) {
    // A re-ask starts a new round: its age and its keys count from there.
    const round = await reaskRound(db, request.id);
    const due = paperReminderDue(round.lastAt ?? request.askedAt, now);
    if (!due) continue;
    if (await askForPaper(db, request, `paper_reminder:${request.id}:${round.count}`)) done += 1;
    if (due !== 'team') continue;
    const notice = {
      kind: 'paper_waiting',
      title: `Still waiting for ${request.title} from ${request.customer}`,
      body: 'The customer was asked more than 4 days ago and has not sent it. Please call them.',
      ...(request.projectId
        ? { subject: { type: 'project' as const, id: request.projectId } }
        : {}),
      dedupeKey: `paper_waiting:${request.id}:${round.count}`,
    };
    const person = request.requestedByUserId ?? request.managerUserId;
    // Nobody to ask: those who manage projects hear, so it is never silent.
    if (person) await notifyCover(db, person, 'projects.manage', notice);
    else await notifyHolders(db, 'projects.manage', notice);
    done += 1;
  }
  return done;
}

/**
 * Files a customer sent on WhatsApp that stayed "to sort" (no home chosen) for over 2
 * hours, for a customer with 2 or more homes: the chat's person is told, once per file.
 */
async function alertFilesToSort(db: Database, now: Date): Promise<number> {
  const waiting = await db
    .select({
      id: documents.id,
      name: documents.name,
      customerId: customers.id,
      customer: customers.name,
      chat: {
        id: waConversations.id,
        phone: waConversations.phone,
        customerId: waConversations.customerId,
        assignedUserId: waConversations.assignedUserId,
        handledByUserId: waConversations.handledByUserId,
      },
    })
    .from(documents)
    .innerJoin(waMessages, eq(waMessages.documentId, documents.id))
    .innerJoin(waConversations, eq(waConversations.id, waMessages.conversationId))
    .innerJoin(customers, eq(customers.id, documents.customerId))
    .where(
      and(
        isNull(documents.projectId),
        isNull(documents.propertyId),
        isNull(documents.removedAt),
        eq(documents.category, 'other'),
        lte(documents.createdAt, new Date(now.getTime() - SORT_AFTER)),
      ),
    )
    .orderBy(asc(documents.createdAt));
  if (waiting.length === 0) return 0;
  const told = new Set<string>();
  const manyHomes = new Map<string, boolean>();
  let alerted = 0;
  for (const file of waiting) {
    if (told.has(file.id)) continue;
    told.add(file.id);
    let many = manyHomes.get(file.customerId);
    if (many === undefined) {
      many = (await customerHomes(db, file.customerId)).length >= 2;
      manyHomes.set(file.customerId, many);
    }
    if (!many) continue;
    const owner = file.chat.assignedUserId ?? (await chatOwnerFor(db, file.chat));
    await tellChatTeam(
      db,
      { ...file.chat, assignedUserId: owner },
      {
        kind: 'papers_to_sort',
        title: `Files to sort from ${file.customer}`,
        body: `${file.name} has no home yet. Open the chat and move it to the right home.`,
        key: `paper_sort:${file.id}`,
      },
    );
    alerted += 1;
  }
  return alerted;
}

/**
 * Chases papers (papers per home): a customer reminder at 2 days and a word to the asker
 * at 4 for requests still open, and the chat's person for files left to sort. Every tick
 * is safe to repeat: each reminder and alert has a key per ask round or per file.
 */
export async function queuePaperReminders(db: Database, now: Date): Promise<number> {
  const reminded = await remindOpenRequests(db, now);
  return reminded + (await alertFilesToSort(db, now));
}
