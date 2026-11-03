import type { ActionItem } from '@oneohm/api-contracts';
import { chatsWaitingSince, type Database, leads, users, waConversations } from '@oneohm/database';
import { chatWaitStage } from '@oneohm/domain';
import { and, eq, isNull, lte, ne, notInArray, or } from 'drizzle-orm';
import { plural } from './command-center-plural';

/** Late chats are counted on the business clock (the same default the API uses). */
const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIMEZONE ?? 'Asia/Kolkata';

export async function leadFollowUps(db: Database, today: string): Promise<ActionItem[]> {
  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(notInArray(leads.stage, ['won', 'lost']), lte(leads.nextActionOn, today)));
  if (rows.length === 0) return [];
  return [
    {
      id: 'leads',
      tone: 'atRisk',
      title: plural(rows.length, '1 lead needs a follow-up', '# leads need a follow-up'),
      detail: 'Due today or earlier',
      action: 'Open leads',
      party: 'internal',
      href: '/leads?filter=due',
    },
  ];
}

/** Open leads with no owner, or whose owner has left: a manager picks one (PRD 3.3). */
export async function unownedLeads(db: Database): Promise<ActionItem[]> {
  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.ownerUserId))
    .where(
      and(
        notInArray(leads.stage, ['won', 'lost']),
        or(isNull(users.id), ne(users.status, 'active')),
      ),
    );
  if (rows.length === 0) return [];
  return [
    {
      id: 'unowned-leads',
      tone: 'atRisk',
      title: plural(rows.length, '1 lead has no owner', '# leads have no owner'),
      detail: 'Pick who follows them up',
      action: 'Assign',
      party: 'internal',
      href: '/leads?filter=unowned',
    },
  ];
}

/**
 * Customers who wrote on WhatsApp and have waited over 2 working hours for a person's
 * answer (the same clock as the reminders). The owner sees how many, not the chats.
 */
export async function lateChats(db: Database): Promise<ActionItem[]> {
  const open = await db
    .select({ id: waConversations.id })
    .from(waConversations)
    .where(eq(waConversations.state, 'human'));
  if (open.length === 0) return [];
  const waiting = await chatsWaitingSince(
    db,
    open.map((chat) => chat.id),
  );
  const now = new Date();
  const late = [...waiting.values()].filter(
    (since) => chatWaitStage(since, now, BUSINESS_TIME_ZONE) === 2,
  ).length;
  if (late === 0) return [];
  return [
    {
      id: 'late-chats',
      tone: 'overdue',
      title: plural(
        late,
        '1 customer is waiting for a WhatsApp reply',
        '# customers are waiting for a WhatsApp reply',
      ),
      detail: 'Waiting over 2 working hours',
      action: 'Open chats',
      party: 'internal',
      href: '/today?tab=chats&filter=late',
    },
  ];
}
