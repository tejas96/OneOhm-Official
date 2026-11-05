import { randomUUID } from 'node:crypto';
import { type DatabaseExecutor, projects } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { contextOfTask } from '../journey/journey-context';
import { type JourneyTask } from '../journey/journey-store';
import { openAction, openActionFor } from '../send-to-customer/send-actions';
import { deliver } from '../send-to-customer/send-deliver';
import { locationAsk } from '../send-to-customer/send-messages';
import { homesOf } from '../send-to-customer/send-reads';
import { inLanguage } from '../whatsapp/assistant/language';

/**
 * After a survey is sent (redesign §7): when the home has no location, the 📍 ask follows (phase 3a), in
 * the same way as the team's "Ask for the location". The project manager (else the step's owner) is the asker.
 * Nothing is sent when a location is known or one is already asked.
 */
export async function askLocationAfter(tx: DatabaseExecutor, task: JourneyTask): Promise<void> {
  const ctx = await contextOfTask(tx, task);
  if (!ctx) return;
  const home = (await homesOf(tx, ctx)).find((one) => one.projectId === task.projectId);
  if (!home || home.located) return;
  if (await openActionFor(tx, ctx.customerId, 'location', { propertyId: home.propertyId })) return;
  const [project] = await tx
    .select({ manager: projects.managerUserId })
    .from(projects)
    .where(eq(projects.id, task.projectId));
  const asker = project?.manager ?? task.assigneeUserId;
  const id = randomUUID();
  await inLanguage(ctx.language, async () => {
    await openAction(tx, ctx, asker, {
      id,
      type: 'location',
      title: `Location of ${home.home}`,
      propertyId: home.propertyId,
      projectId: home.projectId,
      payload: {},
      log: `Asked the customer to share the location of ${home.home} (after the self survey)`,
    });
    await deliver(
      tx,
      ctx,
      locationAsk(ctx.customerName, home.home, id),
      `survey_location:${id}`,
      asker,
    );
  });
}
