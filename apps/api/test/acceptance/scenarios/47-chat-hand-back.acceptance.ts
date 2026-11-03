import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { chatOf, replies, say, tap } from '../support/onboarding';
import { addDays, newCustomer, today } from '../support/sales';
import { ist, runSalesChecks } from '../support/sales-checks';

// Live review B4/B5: while a person has a customer's chat, the assistant still answers the
// menu and quote taps, and those taps neither alert staff nor count as waiting; free text
// and files do. A chat nobody on the team has written in for 4 working hours goes back to
// the assistant by itself, with a line in the chat saying so.
const HANDED_BACK = 'Handed back to the assistant (no reply for 4 working hours)';
const TOMORROW = addDays(today(), 1);

/** "Message from the customer" alerts raised about this chat. */
const messageAlerts = (chatId: string) =>
  rows<{ user_id: string }>(
    `SELECT user_id FROM notifications WHERE kind = 'whatsapp_message' AND subject_id = $1`,
    [chatId],
  );

describe('Chat hand-back and alert noise', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  /** A customer who said hello, and a team member's answer: the chat is a person's now. */
  async function chatWithPerson(name: string) {
    const customer = await newCustomer(admin, { name });
    await say(customer.phone, 'hi');
    const chat = await chatOf(customer.phone);
    await admin.post(`/whatsapp/chats/${chat.id}/reply`, { text: 'Hello from the office (test)' });
    expect((await chatOf(customer.phone)).state).toBe('human');
    return { phone: customer.phone, chatId: chat.id };
  }

  const summaryOf = async (chatId: string) =>
    (await admin.get<{ chat: { needsReply: boolean; state: string } }>(`/whatsapp/chats/${chatId}`))
      .chat;

  it('a menu tap while a person has the chat is answered, alerts nobody and is not waiting', async () => {
    const { phone, chatId } = await chatWithPerson('Menu Tap Customer (test)');
    const before = (await replies(phone)).length;
    await tap(phone, 'payments');
    expect((await replies(phone)).length).toBeGreaterThan(before);
    expect(await messageAlerts(chatId)).toHaveLength(0);
    expect(await summaryOf(chatId)).toMatchObject({ needsReply: false, state: 'human' });
  });

  it('free text while a person has the chat alerts them and waits for an answer', async () => {
    const { phone, chatId } = await chatWithPerson('Free Text Customer (test)');
    const before = (await replies(phone)).length;
    await say(phone, 'When will the team come to my house? (test)');
    expect(await messageAlerts(chatId)).not.toHaveLength(0);
    expect((await summaryOf(chatId)).needsReply).toBe(true);
    // The assistant stays quiet for the person (a night reply aside).
    expect((await replies(phone)).length).toBeLessThanOrEqual(before + 1);
  });

  it('after 4 working hours with no word from the team the chat goes back to the assistant', async () => {
    const { phone, chatId } = await chatWithPerson('Hand Back Customer (test)');
    const waiting = await chatWithPerson('Still Waiting Customer (test)');
    await say(waiting.phone, 'Please call me back (test)');

    await runSalesChecks(admin, ist(TOMORROW, '10:00'));
    expect((await chatOf(phone)).state).toBe('human');

    const run = await runSalesChecks(admin, ist(TOMORROW, '14:00'));
    expect(run.handedBack).toBeGreaterThanOrEqual(1);
    expect((await chatOf(phone)).state).toBe('menu');
    const notes = await rows<{ body: string }>(
      `SELECT body FROM wa_messages WHERE conversation_id = $1 AND kind = 'note'`,
      [chatId],
    );
    expect(notes.map((note) => note.body)).toEqual([HANDED_BACK]);
    // A customer still owed an answer stays with the person (the reminders chase it).
    expect((await chatOf(waiting.phone)).state).toBe('human');

    // Back with the assistant: the next menu tap is answered as usual, and no line repeats.
    await runSalesChecks(admin, ist(TOMORROW, '15:00'));
    const again = await rows(
      `SELECT 1 FROM wa_messages WHERE conversation_id = $1 AND kind = 'note'`,
      [chatId],
    );
    expect(again).toHaveLength(1);
  });
});
