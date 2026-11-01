import type { LeadDetail } from '@oneohm/api-contracts';
import { type DatabaseExecutor, leadActivities, notify, users } from '@oneohm/database';
import type { LeadStage, LeadStep } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { movedNote } from './lead-steps-read';
import { type LeadPatch, type lostColumns, lostNote } from './lead-update';

type ActivityKind = 'note' | 'call' | 'visit' | 'whatsapp' | 'stage_change' | 'follow_up';

/** One line on the lead's timeline; `internal` keeps it from the reseller. */
export async function logLead(
  db: DatabaseExecutor,
  leadId: string,
  userId: string,
  kind: ActivityKind,
  note: string,
  internal = false,
): Promise<void> {
  await db.insert(leadActivities).values({ leadId, userId, kind, note, internal });
}

/** Tells the new owner the lead is theirs, with a link to it. */
export function tellLeadOwner(
  db: DatabaseExecutor,
  owner: string,
  lead: { readonly id: string; readonly name: string; readonly city: string },
  by: string,
): Promise<void> {
  return notify(
    db,
    { userId: owner },
    {
      kind: 'lead_assigned',
      title: 'A lead is yours to follow up',
      body: `${lead.name}, ${lead.city}. From ${by}.`,
      subject: { type: 'lead', id: lead.id },
      dedupeKey: `lead_owner:${lead.id}:${owner}:${Date.now()}`,
    },
  );
}

export interface LeadChange {
  readonly patch: LeadPatch;
  readonly step: LeadStep | null;
  readonly stage: LeadStage;
  readonly lost: ReturnType<typeof lostColumns>;
  readonly owner: string | null | undefined;
}

/** The timeline lines for one update: the move (with why it was lost), follow-up, owner. */
export async function logLeadChanges(
  db: DatabaseExecutor,
  actor: Actor,
  current: LeadDetail,
  { patch, step, stage, lost, owner }: LeadChange,
): Promise<void> {
  const moved = movedNote(current, step, patch.stage);
  const lostNow = stage === 'lost' && current.stage !== 'lost';
  if (moved) {
    const note = lostNow ? `${moved} ${lostNote(lost)}` : moved;
    await logLead(db, current.id, actor.userId, 'stage_change', note);
  } else if (stage === 'lost' && patch.revisitOn !== undefined) {
    await logLead(db, current.id, actor.userId, 'follow_up', lostNote(lost));
  }
  if (patch.nextActionOn && patch.nextActionOn !== current.nextActionOn) {
    const what = patch.nextActionNote ? `: ${patch.nextActionNote}` : '';
    const note = `Next action on ${patch.nextActionOn}${what}.`;
    await logLead(db, current.id, actor.userId, 'follow_up', note);
  }
  if (!owner || owner === current.owner?.id) return;
  const [person] = await db.select({ name: users.fullName }).from(users).where(eq(users.id, owner));
  const note = `Owner set to ${person?.name ?? 'someone new'}.`;
  await logLead(db, current.id, actor.userId, 'note', note, true);
  if (owner !== actor.userId) await tellLeadOwner(db, owner, current, actor.fullName);
}
