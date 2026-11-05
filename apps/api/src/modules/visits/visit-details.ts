import { type DatabaseExecutor, homeNameOf, users, visits } from '@oneohm/database';
import { addDays, todayIn } from '@oneohm/shared';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { whenWords } from './visit-messages';
import { workWords } from './visit-words';

/**
 * [Visit details] on Home: the confirmed visits of the next 30 days, each with the day, what
 * it is for, the home and who comes. Null when there is none (the caller shows the requests).
 */
export async function visitDetails(
  db: DatabaseExecutor,
  customerId: string,
  timeZone = 'Asia/Kolkata',
): Promise<string | null> {
  const today = todayIn(timeZone);
  const rows = await db
    .select()
    .from(visits)
    .where(
      and(
        eq(visits.customerId, customerId),
        eq(visits.status, 'confirmed'),
        gte(visits.day, today),
        lte(visits.day, addDays(today, 30)),
      ),
    )
    .orderBy(asc(visits.day), asc(visits.slot))
    .limit(5);
  if (rows.length === 0) return null;
  const lines: string[] = [];
  for (const row of rows) {
    const crew = row.crewUserIds.length
      ? await db
          .select({ name: users.fullName, phone: users.phoneE164 })
          .from(users)
          .where(inArray(users.id, row.crewUserIds.slice(0, 1)))
      : [];
    const home = await homeNameOf(db, row.projectId, row.propertyId);
    const who = crew[0]
      ? `\n  ${crew[0].name.split(/\s+/)[0]}${crew[0].phone ? ` ${crew[0].phone}` : ''}`
      : '';
    lines.push(`• *${whenWords(row.day, row.slot)}* — ${workWords(row.kind)} · ${home}${who}`);
  }
  return lines.join('\n');
}
