import type { LeadAttribution } from '@oneohm/database';
import { findIndianMobile } from '@oneohm/domain';
import type { IntakeInput } from '../crm/lead-intake.service';
import { SOCIAL_NAME, type SocialChannel, type SocialWindows } from '../whatsapp/social-reply';

/** What a chat remembers about its steps with us. */
export interface SocialContext extends SocialWindows {
  readonly askedNumber?: boolean;
  readonly leadId?: string;
  readonly entry?: LeadAttribution | undefined;
}

export const THANKS_TEXT = 'Thank you! Our solar expert will call you soon.';

/** The first reply: ask for a WhatsApp number and city, by the person's first name. */
export function askText(profileName: string | null, brand: string): string {
  const first = profileName?.trim().split(/\s+/)[0] ?? '';
  const name = first && !first.startsWith('@') && !first.startsWith('+') ? first : 'there';
  const to = brand.trim() ? ` to ${brand.trim()}` : '';
  return `Hi ${name}! Thanks for writing${to}. Please share your WhatsApp number and city, and our solar expert will call you.`;
}

/**
 * What to do with a message: a mobile number (and no lead yet) makes the lead; a first
 * contact with no number is asked for one, once; anything else is for the people to answer.
 */
export function socialPlan(
  context: SocialContext,
  text: string,
): { phone: string | null; makeLead: boolean; ask: boolean } {
  const phone = findIndianMobile(text);
  const makeLead = phone !== null && !context.leadId;
  return { phone, makeLead, ask: !makeLead && !context.askedNumber && !context.leadId };
}

/** The lead made from a chat where the person gave their number. */
export function socialLeadInput(
  channel: SocialChannel,
  phone: string,
  message: string,
  chat: { readonly profileName: string | null },
  entry: LeadAttribution | undefined,
  city: string,
): IntakeInput {
  const platform = SOCIAL_NAME[channel];
  const name = chat.profileName?.replace(/^@/, '').trim();
  return {
    name: name || `${platform} contact`,
    phone,
    city,
    source: channel === 'instagram' ? 'instagram' : 'facebook',
    nextActionNote: `Call now: wrote on ${platform}`,
    firstNote: `Wrote on ${platform}: "${message.replace(/\s+/g, ' ').trim().slice(0, 200)}"`,
    attribution: entry,
  };
}
