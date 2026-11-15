import { phoneDigits } from '../hashing';
import type { PlatformLead } from '../types';

const text = (value: unknown): string | null => {
  const clean = typeof value === 'string' ? value.trim() : '';
  return clean || null;
};
const idOf = (value: unknown): string | null =>
  typeof value === 'string' || typeof value === 'number' ? text(String(value)) : null;

/** E.164 for a phone as typed: 10 digits are Indian; others keep their country code. */
function e164(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phoneDigits(phone);
  return digits ? `+${digits}` : null;
}

/** The first of these answers the form has. */
const pick = (columns: Map<string, string>, ...ids: string[]): string | null => {
  for (const id of ids) {
    const value = columns.get(id);
    if (value) return value;
  }
  return null;
};

/** The full name, or the first and last name joined. */
function nameOf(columns: Map<string, string>): string | null {
  const full = columns.get('FULL_NAME');
  if (full) return full;
  const joined = [columns.get('FIRST_NAME'), columns.get('LAST_NAME')].filter(Boolean).join(' ');
  return joined || null;
}

/** A Google lead form post: its key and the lead in it. Null when it is not one. Never throws. */
export function readGoogleLeadWebhook(
  body: unknown,
): { readonly key: string; readonly lead: PlatformLead } | null {
  try {
    if (!body || typeof body !== 'object') return null;
    const post = body as Record<string, unknown>;
    const leadId = idOf(post.lead_id);
    const key = text(post.google_key);
    if (!leadId || !key) return null;
    const columns = new Map<string, string>();
    if (Array.isArray(post.user_column_data)) {
      for (const column of post.user_column_data) {
        const id = text(column?.column_id)?.toUpperCase();
        const value = text(column?.string_value);
        if (id && value) columns.set(id, value);
      }
    }
    const submitted = text(post.lead_submit_time);
    const when = submitted ? new Date(submitted) : new Date();
    const campaign = idOf(post.campaign_id);
    return {
      key,
      lead: {
        platformLeadId: leadId,
        name: nameOf(columns),
        phone: e164(pick(columns, 'PHONE_NUMBER', 'PHONE_NUMBER_VERIFIED', 'WORK_PHONE')),
        email: pick(columns, 'EMAIL', 'WORK_EMAIL'),
        city: pick(columns, 'CITY', 'CITY_NAME', 'HOME_CITY', 'WORK_CITY'),
        adId: idOf(post.creative_id),
        campaignExternalId: campaign,
        formId: idOf(post.form_id),
        platform: 'google',
        gclid: text(post.gcl_id),
        createdAt: Number.isNaN(when.getTime()) ? new Date() : when,
        isTest: post.is_test === true,
      },
    };
  } catch {
    return null;
  }
}
