import {
  chatOwnerFor,
  customerActions,
  type Database,
  homeNameOf,
  languageOf,
  queueCustomerMessage,
  users,
} from '@oneohm/database';
import { VISIT_PHRASES, type VisitKind } from '@oneohm/domain';
import { titleCaseName } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { confirmReminder, signatureReminder } from './journey-reminders';

export interface Row {
  readonly action: typeof customerActions.$inferSelect;
  readonly customer: string;
  readonly phone: string;
  readonly manager: string | null;
}

/** The customer never picked a day for a visit: the same ask again, by the approved template. */
export async function remindVisitPick(db: Database, { action, customer, phone }: Row, key: string) {
  const code = (await languageOf(db, phone)).slice(0, 2);
  const kind = (action.payload.visitKind as VisitKind | undefined) ?? 'service';
  const words = VISIT_PHRASES[code === 'mr' || code === 'hi' ? code : 'en'];
  return queueCustomerMessage(
    db,
    phone,
    'visit_pick',
    {
      customer: titleCaseName(customer),
      home: await homeNameOf(db, action.projectId, action.propertyId),
      work: words.work[kind],
      pickPayload: `vask:${action.id}`,
    },
    key,
  );
}

/** The customer never picked a time: the three buttons again, by the approved template. */
export async function remindCallback(db: Database, { action, customer, phone }: Row, key: string) {
  const [owner] = await db
    .select({ name: users.fullName })
    .from(users)
    .where(
      eq(
        users.id,
        (await chatOwnerFor(db, { customerId: action.customerId, phone })) ??
          action.requestedByUserId ??
          '',
      ),
    );
  const tap = (slot: string) => `cb:${action.id}:${slot}`;
  return queueCustomerMessage(
    db,
    phone,
    'callback_request',
    {
      customer: titleCaseName(customer),
      staff: owner?.name.split(/\s+/)[0] ?? 'our team',
      morningPayload: tap('morning'),
      afternoonPayload: tap('afternoon'),
      eveningPayload: tap('evening'),
    },
    key,
  );
}

/** The roof or installation question, or the paper to agree to, again by its approved template. */
export async function remindJourney(db: Database, { action, customer, phone }: Row, key: string) {
  const given = {
    customer: titleCaseName(customer),
    home: await homeNameOf(db, action.projectId, action.propertyId),
  };
  const { template, payload } =
    action.type === 'signature' ? signatureReminder(action, given) : confirmReminder(action, given);
  return queueCustomerMessage(db, phone, template, payload, key);
}

/** The self survey offered or started and not sent: the same way in again, by the (marketing) template. */
export async function remindSurvey(db: Database, { action, customer, phone }: Row, key: string) {
  return queueCustomerMessage(
    db,
    phone,
    'self_survey_reminder',
    {
      customer: titleCaseName(customer),
      home: await homeNameOf(db, action.projectId, action.propertyId),
      continuePayload: `ss:go:${action.id}`,
    },
    key,
  );
}
