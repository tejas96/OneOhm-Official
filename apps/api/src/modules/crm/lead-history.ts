import type { LeadDetail } from '@oneohm/api-contracts';
import { type DatabaseExecutor, leadActivities, leads, notify, users } from '@oneohm/database';
import { effectiveStep, type LeadStage, type LeadStep } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { STAGE_LABEL } from './lead-labels';
import { loadLeadSteps, movedNote } from './lead-steps-read';
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
  const move = moveLine(current, { patch, step, stage, lost });
  if (move) await logLead(db, current.id, actor.userId, move.kind, move.note);
  const followUp = followUpNote(current, patch);
  if (followUp) await logLead(db, current.id, actor.userId, 'follow_up', followUp);
  if (!owner || owner === current.owner?.id) return;
  const [person] = await db.select({ name: users.fullName }).from(users).where(eq(users.id, owner));
  const note = `Owner set to ${person?.name ?? 'someone new'}.`;
  await logLead(db, current.id, actor.userId, 'note', note, true);
  if (owner !== actor.userId) await tellLeadOwner(db, owner, current, actor.fullName);
}

/** The stage move (with why it was lost), or why a lost lead's revisit day changed. */
function moveLine(
  current: LeadDetail,
  { patch, step, stage, lost }: Omit<LeadChange, 'owner'>,
): { readonly kind: ActivityKind; readonly note: string } | null {
  const moved = movedNote(current, step, patch.stage);
  const lostNow = stage === 'lost' && current.stage !== 'lost';
  if (moved) {
    return { kind: 'stage_change', note: lostNow ? `${moved} ${lostNote(lost)}` : moved };
  }
  if (stage === 'lost' && patch.revisitOn !== undefined) {
    return { kind: 'follow_up', note: lostNote(lost) };
  }
  return null;
}

/** "Next action on <day> at <time>: <what>." when the day or time changed; else null. */
function followUpNote(current: LeadDetail, patch: LeadPatch): string | null {
  const day = patch.nextActionOn ?? current.nextActionOn;
  const time = patch.nextActionTime === undefined ? current.nextActionTime : patch.nextActionTime;
  const newDay = Boolean(patch.nextActionOn) && patch.nextActionOn !== current.nextActionOn;
  const newTime =
    patch.nextActionTime !== undefined && patch.nextActionTime !== current.nextActionTime;
  if (!day || !(newDay || newTime)) return null;
  const what = patch.nextActionNote ? `: ${patch.nextActionNote}` : '';
  const at = newDay && patch.nextActionTime === undefined ? '' : time ? ` at ${time}` : '';
  return `Next action on ${day}${at}${what}.`;
}

/**
 * A move the system makes on its own (a quotation sent or accepted), written to the
 * timeline with why. `note` says what happened; the move is added when the stage changes.
 * Sending never pulls a lead back from won, and never reopens a lost lead.
 */
export async function autoMoveLead(
  db: DatabaseExecutor,
  leadId: string,
  userId: string,
  stage: 'quoted' | 'won',
  note: string,
): Promise<void> {
  const [lead] = await db
    .select({ stage: leads.stage, stepKey: leads.stepKey })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!lead) return;
  const blocked = stage === 'quoted' ? ['quoted', 'won', 'lost'] : ['won'];
  if (blocked.includes(lead.stage)) {
    await logLead(db, leadId, userId, 'note', note);
    return;
  }
  const steps = await loadLeadSteps(db);
  const from = effectiveStep(steps, lead.stage, lead.stepKey);
  const to = effectiveStep(steps, stage, null);
  await db
    .update(leads)
    .set({
      stage,
      stepKey: null,
      ...(stage === 'won'
        ? { wonAt: new Date(), lostReasonKey: null, lostReason: null, revisitOn: null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));
  const moved = `Moved from ${from?.name ?? STAGE_LABEL[lead.stage]} to ${to?.name ?? STAGE_LABEL[stage]}.`;
  await logLead(db, leadId, userId, 'stage_change', `${note} ${moved}`);
}
