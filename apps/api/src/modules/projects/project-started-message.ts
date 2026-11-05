import { type DatabaseExecutor, homeNameOf, users } from '@oneohm/database';
import { titleCaseName } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { queueWhatsApp } from '../../common/outbox';
import { mayChat, send } from '../journey/auto-messages';
import { localized, type Words } from '../whatsapp/assistant/language';

const EN = {
  started: (home: string, manager: string) =>
    `Your solar project (*${home}*) has started ✅\n${manager} is your project manager and will keep you posted here.`,
};
const MR: Words<typeof EN> = {
  started: (home, manager) =>
    `तुमचा सोलर प्रकल्प (*${home}*) सुरू झाला ✅\n${manager} तुमचे प्रोजेक्ट मॅनेजर आहेत आणि इथे तुम्हाला माहिती देत राहतील.`,
};
const HI: Words<typeof EN> = {
  started: (home, manager) =>
    `आपका सोलर प्रोजेक्ट (*${home}*) शुरू हो गया ✅\n${manager} आपके प्रोजेक्ट मैनेजर हैं और यहाँ आपको जानकारी देते रहेंगे।`,
};

/** Every language, for the checks. */
export const PROJECT_STARTED_LISTS = { en: EN, mr: MR, hi: HI };
const WORDS = localized(EN, { mr: MR, hi: HI });

/**
 * "Your project has started" (redesign §19): inside the 24-hour window a chat message that names the
 * project manager; outside it the approved `project_started` template as before.
 */
export async function tellProjectStarted(
  tx: DatabaseExecutor,
  given: {
    readonly phone: string;
    readonly customer: string;
    readonly projectId: string;
    readonly code: string;
    readonly capacity: string;
    readonly managerUserId: string | null;
  },
): Promise<void> {
  const payload = { customer: given.customer, project: given.code, capacity: given.capacity };
  const key = `project_started:${given.projectId}`;
  const [manager] = given.managerUserId
    ? await tx.select({ name: users.fullName }).from(users).where(eq(users.id, given.managerUserId))
    : [];
  if (!manager?.name || !(await mayChat(tx, given.phone, 'project_started'))) {
    await queueWhatsApp(tx, given.phone, 'project_started', payload, key);
    return;
  }
  const first = titleCaseName(manager.name.split(' ')[0] ?? manager.name);
  // The customer knows the home, not our project code.
  const home = await homeNameOf(tx, given.projectId);
  await send(
    tx,
    { phone: given.phone },
    {
      template: 'project_started',
      payload,
      key,
      reply: async () => ({ kind: 'text', body: WORDS.started(home, first) }),
    },
  );
}
