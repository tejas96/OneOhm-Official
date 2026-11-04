import { Inject, Injectable } from '@nestjs/common';
import { customerActions, customerHomes, homeNameOf, tellChatTeam } from '@oneohm/database';
import { type GeoPoint, pinDecision } from '@oneohm/domain';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { DATABASE, type Database } from '../../config/core.module';
import { logAction } from '../documents/customer-action-log';
import { sayWithTaps } from '../whatsapp/assistant/closing-taps';
import { ensureChatOwner } from '../whatsapp/chat-owner';
import { type Conversation, queueReply } from '../whatsapp/chat-store';
import type { IncomingLocation } from '../whatsapp/whatsapp-events';
import { lockedPoint, savePin } from './apply-pin';
import { actionFor, parkPin } from './location-actions';
import { SEND_WORDS } from './send-words';

type ActionRow = typeof customerActions.$inferSelect;

/** The tap id of a home in "Which home is this location for?": the action and the home. */
export const homeTap = (actionId: string, propertyId: string) => `locn:${actionId}:${propertyId}`;
const HOME_TAP = /^locn:([0-9a-f-]{36}):([0-9a-f-]{36})$/;
/** The action and home a "which home" tap names, or null. */
export const readHomeTap = (id: string | null) => {
  const match = HOME_TAP.exec(id ?? '');
  return match ? { actionId: match[1] as string, propertyId: match[2] as string } : null;
};

const pointOf = (pin: IncomingLocation): GeoPoint => ({
  latitude: pin.latitude,
  longitude: pin.longitude,
});

/**
 * A pin the customer sent (redesign §6). It answers the home the team asked about; with no
 * ask and one home it goes there; with 2+ homes and no ask the customer is asked "Which home?".
 * A home with no location takes it (`whatsapp_pin`); a home that has a point keeps it and the
 * pin becomes a suggestion the team checks. Never overwrites a surveyor's point.
 */
@Injectable()
export class LocationPinService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** `onlyAsked`: a person has the chat, so a pin that answers no ask is left to them. */
  async receive(
    chat: Conversation,
    customerId: string,
    pin: IncomingLocation,
    onlyAsked = false,
  ): Promise<boolean> {
    const asked = await this.askedHomes(customerId);
    if (onlyAsked && asked.length === 0) return false;
    const homes = await customerHomes(this.db, customerId);
    const among =
      asked.length > 0 ? asked.map((one) => one.propertyId) : homes.map((h) => h.propertyId);
    const [only] = among;
    if (among.length === 1 && only) {
      await this.settle(chat, customerId, only, pin, undefined, onlyAsked);
      return true;
    }
    if (among.length === 0) return false;
    await this.askWhich(chat, customerId, pin, among);
    return true;
  }

  /** A tap on a home in "Which home?": the waiting pin goes there. */
  async homePicked(chat: Conversation, customerId: string, actionId: string, propertyId: string) {
    const [waiting] = await this.db
      .select()
      .from(customerActions)
      .where(
        and(
          eq(customerActions.id, actionId),
          eq(customerActions.customerId, customerId),
          eq(customerActions.type, 'location'),
          eq(customerActions.status, 'open'),
          isNull(customerActions.propertyId),
        ),
      );
    const pin = waiting?.payload.pin as IncomingLocation | undefined;
    const among = (waiting?.payload.among as string[] | undefined) ?? [];
    if (!waiting || !pin || !among.includes(propertyId)) {
      return void (await queueReply(this.db, chat, { kind: 'text', body: SEND_WORDS.old }));
    }
    await this.settle(chat, customerId, propertyId, pin, waiting);
  }

  /** The homes the team asked a location for, still waiting. */
  private async askedHomes(customerId: string) {
    return this.db
      .select({ propertyId: customerActions.propertyId, id: customerActions.id })
      .from(customerActions)
      .where(
        and(
          eq(customerActions.customerId, customerId),
          eq(customerActions.type, 'location'),
          eq(customerActions.status, 'open'),
          isNotNull(customerActions.propertyId),
        ),
      )
      .then((rows) =>
        rows.flatMap((row) => (row.propertyId ? [{ ...row, propertyId: row.propertyId }] : [])),
      );
  }

  /** The pin waits as an open action with no home, and the customer picks the home. */
  private async askWhich(
    chat: Conversation,
    customerId: string,
    pin: IncomingLocation,
    among: readonly string[],
  ) {
    const homes = (await customerHomes(this.db, customerId)).filter((h) =>
      among.includes(h.propertyId),
    );
    const id = await parkPin(this.db, customerId, pin, among);
    await queueReply(this.db, chat, {
      kind: 'list',
      body: SEND_WORDS.location.which,
      button: SEND_WORDS.buttons.chooseHome,
      rows: homes.slice(0, 10).map((home) => ({
        id: homeTap(id, home.propertyId),
        title: home.title,
        description: home.description,
      })),
    });
  }

  /** Puts the pin on the home: saves it, keeps it as a suggestion, or finds it already there. */
  private async settle(
    chat: Conversation,
    customerId: string,
    propertyId: string,
    pin: IncomingLocation,
    waiting?: ActionRow,
    /** A person has the chat: they are told, the bot says nothing to the customer. */
    quiet = false,
  ) {
    const home = await homeNameOf(this.db, null, propertyId);
    const outcome = await this.db.transaction(async (tx) => {
      const current = await lockedPoint(tx, propertyId);
      const decision = pinDecision(current, pointOf(pin));
      const action = await actionFor(tx, customerId, propertyId, pin, waiting);
      const done = { doneAt: new Date(), updatedAt: new Date() };
      if (decision === 'suggest') {
        await tx
          .update(customerActions)
          .set({ status: 'received', propertyId, payload: { pin }, ...done })
          .where(eq(customerActions.id, action.id));
      } else {
        if (decision === 'save')
          await savePin(tx, propertyId, pointOf(pin), current, null, 'filled');
        await tx
          .update(customerActions)
          .set({ status: 'closed', propertyId, payload: { pin }, closedAt: new Date(), ...done })
          .where(eq(customerActions.id, action.id));
      }
      await logAction(tx, action, {
        kind: 'customer_action',
        message:
          decision === 'suggest'
            ? `Customer sent a location for ${home}; it differs from the saved point, please check`
            : `Customer sent the location of ${home} on WhatsApp`,
        userId: null,
        data: { customerActionId: action.id, decision },
      });
      await recordAudit(
        tx,
        null,
        `customer_action.location_${decision}`,
        'customer_action',
        action.id,
      );
      return decision;
    });
    if (outcome === 'suggest' || quiet) await this.tellTeam(chat, home, outcome);
    if (quiet) return;
    const words = SEND_WORDS.location;
    const text =
      outcome === 'save'
        ? words.saved(home)
        : outcome === 'same'
          ? words.same(home)
          : words.checking(home);
    await sayWithTaps(this.db, chat, text, ['menu']);
  }

  private async tellTeam(chat: Conversation, home: string, outcome: 'save' | 'same' | 'suggest') {
    const owned = await ensureChatOwner(this.db, chat);
    const who = chat.profileName ?? 'a customer';
    await tellChatTeam(this.db, owned, {
      kind: outcome === 'suggest' ? 'location_check' : 'location_saved',
      title:
        outcome === 'suggest'
          ? `Check the location ${who} sent`
          : `Location of ${home} saved from ${who}`,
      body:
        outcome === 'suggest'
          ? `${home} already has a location. The customer's pin is kept as a suggestion: accept or ignore it on the property.`
          : `${who} answered the location ask while you have the chat. It is saved on ${home}.`,
      key: `location_${outcome}:${chat.id}:${Date.now()}`,
    });
  }
}
