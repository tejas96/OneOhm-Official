import { type DatabaseExecutor, leads } from '@oneohm/database';
import type { OnboardAnswers, OnboardingSettings, OnboardStep } from '@oneohm/domain';
import { and, eq, notInArray } from 'drizzle-orm';
import { type LeadChatChange, updateLeadFromChat } from '../../crm/lead-from-chat';
import type { LeadIntakeService } from '../../crm/lead-intake.service';
import { savedEntry } from '../assistant/entry-capture';
import type { Conversation } from '../chat-store';

/**
 * The staff side of onboarding: the lead made at the city answer, each later answer
 * written on it with one history note, and the summary a person gets on a hand-over.
 * Staff read English, whatever language the customer chose.
 */
const LANGUAGE = { en: 'English', mr: 'Marathi', hi: 'Hindi' } as const;
const SITE = {
  home: 'Home',
  society: 'Housing society',
  business: 'Shop or business',
  farm: 'Farm',
};
const ROOF = { rcc: 'RCC', tin: 'Tin sheet', other: 'Other roof' };
const CATEGORY = { home: 'individual', society: 'society', business: 'commercial' } as const;
/** A lead made by a call-back or a nudge before the city was asked. */
const NO_CITY = 'Not given';

export interface OpenLead {
  readonly id: string;
  readonly name: string;
  readonly city: string;
}

export async function openLeadFor(db: DatabaseExecutor, phone: string): Promise<OpenLead | null> {
  const [lead] = await db
    .select({ id: leads.id, name: leads.name, city: leads.city })
    .from(leads)
    .where(and(eq(leads.phoneE164, phone), notInArray(leads.stage, ['won', 'lost'])))
    .limit(1);
  return lead ?? null;
}

/** What the lead already tells us, so those questions are skipped. */
export const knownFrom = (lead: OpenLead | null): Partial<OnboardAnswers> =>
  lead ? { name: lead.name, ...(lead.city !== NO_CITY ? { city: lead.city } : {}) } : {};

const floorsText = (floors: number) => (floors === 1 ? '1 floor' : `${floors} floors`);
const roofAnd = (roof: OnboardAnswers['roof']) => (roof ? `${ROOF[roof]}, ` : '');

function billText(bill: string, settings: OnboardingSettings): string {
  const band = settings.billBands.find((candidate) => candidate.id === bill);
  if (!band) return bill;
  return band.targetWp ? `${band.label} (about ${band.targetWp / 1000} kW)` : band.label;
}

/** "Onboarding answers so far: Language: English; Name: …" for the person taking over. */
export function summaryOf(answers: OnboardAnswers, settings: OnboardingSettings): string {
  const parts = [
    answers.language && `Language: ${LANGUAGE[answers.language]}`,
    answers.name && `Name: ${answers.name}`,
    answers.city && `City: ${answers.city}`,
    answers.site && `Site: ${SITE[answers.site]}`,
    answers.bill && `Bill: ${billText(answers.bill, settings)}`,
    answers.roof && `Roof: ${ROOF[answers.roof]}`,
    answers.floors && `Floors: ${answers.floors}`,
    answers.photo && `Bill photo: ${answers.photo === 'later' ? 'will send later' : 'sent'}`,
  ].filter(Boolean);
  return `Onboarding answers so far: ${parts.length > 0 ? parts.join('; ') : 'none yet'}`;
}

type Write = { readonly change: LeadChatChange; readonly note: string } | null;

/** For each answer after the city: what it changes on the lead and its history note. */
const WRITES: Partial<Record<OnboardStep, (a: OnboardAnswers, s: OnboardingSettings) => Write>> = {
  name: (a) => (a.name ? { change: { name: a.name }, note: `Name: ${a.name}` } : null),
  city: (a) => (a.city ? { change: { city: a.city }, note: `City: ${a.city}` } : null),
  site: (a) =>
    a.site
      ? {
          change: a.site === 'farm' ? {} : { subsidyCategory: CATEGORY[a.site] },
          note: `Site: ${SITE[a.site]}`,
        }
      : null,
  bill: (a, s) => {
    const wp = s.billBands.find((band) => band.id === a.bill)?.targetWp;
    return a.bill
      ? { change: wp ? { estimatedWp: wp } : {}, note: `Bill: ${billText(a.bill, s)}` }
      : null;
  },
  roof: (a) => (a.roof ? { change: {}, note: `Roof: ${ROOF[a.roof]}` } : null),
  floors: (a) =>
    a.floors ? { change: {}, note: `Roof: ${roofAnd(a.roof)}${floorsText(a.floors)}` } : null,
  photo: (a) => (a.photo === 'later' ? { change: {}, note: 'Bill photo: will send later' } : null),
};

/**
 * Makes the lead for an onboarding chat that has none (owner by rule, follow-up today, the
 * saved ad entry), in the caller's transaction. The caller forgets the chat's saved entry.
 * Used at the city answer, and by a hand-over or a stalled chat before the city.
 */
export async function makeLead(
  tx: DatabaseExecutor,
  intake: LeadIntakeService,
  chat: Conversation,
  answers: OnboardAnswers,
  fallbackName: string,
  nextActionNote: string,
): Promise<string> {
  const made = await intake.receive(
    {
      name: answers.name ?? (chat.profileName?.trim() || fallbackName),
      phone: chat.phone,
      city: answers.city ?? NO_CITY,
      source: 'whatsapp',
      attribution: savedEntry(chat),
      firstNote: 'Started onboarding on WhatsApp',
      nextActionNote,
    },
    tx,
  );
  return made.leadId;
}

/**
 * Writes the answer just given on the lead, in the caller's transaction. The city answer
 * makes the lead (owner by rule, follow-up today, saved ad entry) when there is none.
 * Returns the lead, and whether it was made now (so the chat forgets its entry).
 */
export async function writeAnswer(
  tx: DatabaseExecutor,
  intake: LeadIntakeService,
  input: {
    readonly chat: Conversation;
    readonly lead: OpenLead | null;
    readonly step: OnboardStep;
    readonly answers: OnboardAnswers;
    readonly settings: OnboardingSettings;
  },
): Promise<{ leadId: string | null; created: boolean }> {
  const { chat, lead, step, answers } = input;
  if (step === 'city' && !lead) {
    const leadId = await makeLead(
      tx,
      intake,
      chat,
      answers,
      'WhatsApp contact',
      'Finish onboarding',
    );
    return { leadId, created: true };
  }
  const write = lead ? WRITES[step]?.(answers, input.settings) : null;
  if (lead && write) await updateLeadFromChat(tx, lead.id, write.change, write.note);
  return { leadId: lead?.id ?? null, created: false };
}
