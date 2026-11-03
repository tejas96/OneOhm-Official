import type {
  LeadAssignmentRulesRecord,
  LeaveRequestRecord,
  MessageTemplate,
} from '@oneohm/api-contracts';
import { rows } from './db';
import { Session } from './http';
import { withOnboarding } from './onboarding';
import { type OwnPerson, ownPerson, retire } from './people';
import { discomId, today } from './sales';
import { staffEmail, TEAM_PASSWORD } from './team';

/**
 * Shared helpers for the full-journey scenarios (42, 43): the owner's settings switched on
 * for the run and put back after, and plain reads of what changed on our side.
 */
export const EXTRAS = ['quotation_sent', 'payment_link', 'payment_received'] as const;

/** Sets the template's "Meta approved the file and buttons" switch through Settings. */
export async function setExtras(admin: Session, key: string, on: boolean): Promise<boolean> {
  const list = await admin.get<MessageTemplate[]>('/settings/message-templates');
  const template = list.find((candidate) => candidate.key === key);
  if (!template) throw new Error(`No message template ${key}.`);
  const { metaName, language, metaNameMr, metaNameHi, fields, preview, active } = template;
  await admin.put(`/settings/message-templates/${key}`, {
    ...{ metaName, language, metaNameMr, metaNameHi, fields, preview, active },
    extrasApproved: on,
  });
  return template.extrasApproved;
}

/** Puts a business setting row back exactly as found (or removes it when there was none). */
async function settingKeeper(key: string): Promise<() => Promise<void>> {
  const [before] = await rows<{ value: unknown }>(
    'SELECT value FROM business_settings WHERE key = $1',
    [key],
  );
  return async () => {
    if (!before) await rows('DELETE FROM business_settings WHERE key = $1', [key]);
    else
      await rows('UPDATE business_settings SET value = $2::jsonb WHERE key = $1', [
        key,
        JSON.stringify(before.value),
      ]);
  };
}

export interface JourneySetup {
  /** The Pune city owner on approved leave today: never given the lead. */
  away: OwnPerson;
  /** The Pune city owner at work: the lead's owner. */
  owner: OwnPerson;
  ownerSession: Session;
  rule: LeadAssignmentRulesRecord;
  restore: () => Promise<void>;
}

/**
 * Step 1 of the journey: two Pune sales people (one on approved leave today), the Pune
 * city-owner rule, the campaign code, onboarding on with Pune listed, and the template
 * extras switched on. `restore` puts every setting back.
 */
export async function journeySetup(
  admin: Session,
  campaign: { code: string; name: string },
): Promise<JourneySetup> {
  // "Aarti" sorts first, so without the leave rule the lead would be hers.
  const away = await ownPerson(admin, 'Aarti Away Pune (test)', ['sales']);
  const owner = await ownPerson(admin, 'Bharat Pune Sales (test)', ['sales']);
  const hr = await Session.password(staffEmail('hr'), TEAM_PASSWORD);
  const asked = await (await Session.code(away.phone)).post<LeaveRequestRecord>('/leave', {
    leaveType: 'casual',
    fromDate: today(),
    toDate: today(),
    halfDay: false,
  });
  await hr.post(`/leave/${asked.id}/decide`, { approve: true });

  const keepRule = await settingKeeper('lead_assignment');
  const rule = await admin.put<LeadAssignmentRulesRecord>('/settings/lead-assignment', {
    strategy: 'least_busy',
    cityOwners: [
      { userId: away.id, cities: ['Pune'] },
      { userId: owner.id, cities: ['Pune'] },
    ],
  });

  await rows('DELETE FROM lead_campaigns WHERE code = $1', [campaign.code]);
  await rows('UPDATE leads SET campaign_code = NULL WHERE campaign_code = $1', [campaign.code]);
  await admin.post('/lead-campaigns', campaign);

  const keepOnboarding = await withOnboarding(admin, {
    enabled: true,
    serviceCities: ['Pune', 'Satara'],
  });
  const extrasBefore = new Map<string, boolean>();
  for (const key of EXTRAS) extrasBefore.set(key, await setExtras(admin, key, true));

  return {
    away,
    owner,
    ownerSession: await Session.code(owner.phone),
    rule,
    restore: async () => {
      for (const [key, on] of extrasBefore) await setExtras(admin, key, on);
      await keepOnboarding();
      await keepRule();
      await rows('DELETE FROM leave_requests WHERE user_id = $1', [away.id]);
      await rows('DELETE FROM lead_campaigns WHERE code = $1', [campaign.code]);
      await retire(admin, [away, owner]);
    },
  };
}

export interface LeadState {
  id: string;
  name: string;
  city: string;
  source: string;
  stage: string;
  owner_user_id: string | null;
  subsidy_category: string;
  estimated_wp: number | null;
  next_action_on: string;
  next_action_note: string;
  campaign_code: string | null;
  ad_id: string | null;
  ad_headline: string | null;
}

export async function leadState(leadId: string): Promise<LeadState> {
  const [lead] = await rows<LeadState>(
    `SELECT id, name, city, source, stage::text AS stage, owner_user_id, subsidy_category,
            estimated_wp, to_char(next_action_on, 'YYYY-MM-DD') AS next_action_on,
            next_action_note, campaign_code, ad_id, ad_headline
       FROM leads WHERE id = $1`,
    [leadId],
  );
  if (!lead) throw new Error(`No lead ${leadId}.`);
  return lead;
}

/** Who got a staff alert of this kind about this record (subject id or dedupe key prefix). */
export async function alerted(kind: string, about: string): Promise<string[]> {
  const found = await rows<{ user_id: string }>(
    `SELECT user_id FROM notifications
      WHERE kind = $1 AND (subject_id::text = $2 OR dedupe_key LIKE $2 || '%')`,
    [kind, about],
  );
  return found.map((row) => row.user_id);
}

/** Active staff whose role carries this capability (who `notifyHolders` tells). */
export async function holdersOf(capability: string): Promise<string[]> {
  const found = await rows<{ id: string }>(
    `SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id AND r.archived_at IS NULL AND r.kind = 'staff'
       JOIN role_capabilities rc ON rc.role_id = r.id AND rc.capability = $1
      WHERE u.status = 'active'`,
    [capability],
  );
  return found.map((row) => row.id);
}

/** The customer-facing outbox rows of one template for this phone, oldest first. */
export function outboxOf(phone: string, template: string) {
  return rows<{ id: string; payload: Record<string, string>; dedupe_key: string }>(
    `SELECT id, payload, dedupe_key FROM outbox WHERE recipient = $1 AND template = $2
      ORDER BY created_at, id`,
    [phone, template],
  );
}

/** Fetches a public file link the way Meta would; returns its status and type. */
export async function fetchFile(url: string): Promise<{ status: number; type: string }> {
  const res = await fetch(url);
  await res.arrayBuffer();
  return { status: res.status, type: res.headers.get('content-type') ?? '' };
}

/** Lead history notes, oldest first. */
export async function historyOf(leadId: string): Promise<string[]> {
  const found = await rows<{ note: string }>(
    // Notes written in one transaction share a time; the row order keeps them as written.
    'SELECT note FROM lead_activities WHERE lead_id = $1 ORDER BY created_at, ctid',
    [leadId],
  );
  return found.map((row) => row.note);
}

/** Every active non-desk person who manages leads (the people the lead rule chooses from). */
export async function sellers(): Promise<string[]> {
  const found = await rows<{ id: string }>(
    `SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id AND r.archived_at IS NULL AND r.kind = 'staff'
                    AND NOT r.system
       JOIN role_capabilities rc ON rc.role_id = r.id AND rc.capability = 'leads.manage'
      WHERE u.status = 'active'`,
  );
  return found.map((row) => row.id);
}

/** Step 7 as sales does it: the lead becomes a customer with a Pune home site. */
export function convertInPune(admin: Session, seller: Session, leadId: string) {
  return discomId(admin, 'MSEDCL').then((discom) =>
    seller.post<{ customerId: string; propertyId: string }>(`/leads/${leadId}/customer`, {
      kind: 'individual',
      property: {
        ...{ label: 'Home (test)', addressLine: '5 Baner Road (test)', city: 'Pune' },
        ...{ district: 'Pune', state: 'Maharashtra', pincode: '411045' },
        ...{ subsidyCategory: 'individual', households: null, discomId: discom, floors: 2 },
        meterInSocietyName: null,
      },
    }),
  );
}

/** Step 9 as the office does it: the project from the accepted quote, no loan, today. */
export async function startProject(admin: Session, quotationId: string) {
  return admin.post<{ id: string }>('/projects', {
    quotationId,
    discomId: await discomId(admin, 'MSEDCL'),
    ...{ loan: false, lenderName: null, loanPaise: 0, battery: false, groundMount: false },
    startDate: today(),
  });
}

export const statusOf = async (table: string, id: string) =>
  (await rows<{ status: string }>(`SELECT status::text FROM ${table} WHERE id = $1`, [id]))[0]
    ?.status;

export const auditsOf = (action: string, entityId: string) =>
  rows<{ actor_user_id: string | null; data: Record<string, unknown> }>(
    'SELECT actor_user_id, data FROM audit_log WHERE action = $1 AND entity_id = $2',
    [action, entityId],
  );
