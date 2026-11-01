import { type Database, notifications, pushDevices } from '@oneohm/database';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { PushSender } from '../channels/expo-push';

export interface PushOutcome {
  readonly status: 'sent' | 'skipped' | 'failed';
  readonly note: string | null;
}

/**
 * Sends one alert to every phone its person turned alerts on for. Phones Expo reports as
 * gone are switched off; a temporary failure throws so the workflow retries.
 */
export async function deliverPush(
  db: Database,
  sender: PushSender,
  notificationId: string,
): Promise<PushOutcome> {
  const [notice] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, notificationId))
    .limit(1);
  if (!notice) return { status: 'failed', note: 'The alert no longer exists.' };
  const owner = notice.userId
    ? eq(pushDevices.userId, notice.userId)
    : eq(pushDevices.customerId, notice.customerId ?? '');
  const phones = await db
    .select({ token: pushDevices.token })
    .from(pushDevices)
    .where(and(owner, isNull(pushDevices.disabledAt)));
  if (phones.length === 0) return { status: 'skipped', note: 'No phone has alerts turned on.' };
  const result = await sender.send({
    tokens: phones.map((phone) => phone.token),
    title: notice.title,
    body: notice.body,
    data: {
      notificationId: notice.id,
      kind: notice.kind,
      ...(notice.subjectType ? { subjectType: notice.subjectType } : {}),
      ...(notice.subjectId ? { subjectId: notice.subjectId } : {}),
      ...(notice.projectId ? { projectId: notice.projectId } : {}),
    },
  });
  if (result.outcome === 'logged')
    return { status: 'skipped', note: 'Not sent: push delivery is in log mode.' };
  const gone = result.tickets.filter((ticket) => !ticket.ok && ticket.gone);
  if (gone.length > 0)
    await db
      .update(pushDevices)
      .set({ disabledAt: new Date(), disabledReason: 'The app was removed or alerts turned off.' })
      .where(
        inArray(
          pushDevices.token,
          gone.map((ticket) => ticket.token),
        ),
      );
  const sent = result.tickets.filter((ticket) => ticket.ok).length;
  if (sent > 0)
    return { status: 'sent', note: `Sent to ${sent} of ${result.tickets.length} phones.` };
  const first = result.tickets.find((ticket) => !ticket.ok);
  return { status: 'failed', note: first && !first.ok ? first.error : 'Push failed.' };
}
