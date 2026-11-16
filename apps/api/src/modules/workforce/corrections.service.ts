import { Inject, Injectable } from '@nestjs/common';
import type { AttendanceCorrection } from '@oneohm/api-contracts';
import {
  attendanceCorrections,
  attendanceDays,
  notify,
  notifyHolders,
  type Transaction,
  takeTravelSnapshot,
  users,
} from '@oneohm/database';
import { correctionDateProblem } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { STAFF_NOTICES } from '../../common/notices';
import { DATABASE, type Database } from '../../config/core.module';
import { ALREADY_PENDING, assertDayFits, pendingClash } from './correction-rules';
import { pruneDutyPoints } from './duty-prune';
import { isLateAt } from './late-rule';
import { loadPolicy } from './policy';

interface CorrectionInput {
  workDate: string;
  checkInAt?: string | null | undefined;
  checkOutAt?: string | null | undefined;
  reason: string;
}

/** "I forgot to check out": the person asks, an approver decides (PRD 4.3). */
@Injectable()
export class CorrectionsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(where?: SQL): Promise<AttendanceCorrection[]> {
    const rows = await this.db
      .select({ row: attendanceCorrections, fullName: users.fullName })
      .from(attendanceCorrections)
      .innerJoin(users, eq(users.id, attendanceCorrections.userId))
      .where(where)
      .orderBy(desc(attendanceCorrections.createdAt));
    return rows.map(({ row, fullName }) => ({
      id: row.id,
      user: { id: row.userId, fullName },
      workDate: row.workDate,
      checkInAt: row.checkInAt?.toISOString() ?? null,
      checkOutAt: row.checkOutAt?.toISOString() ?? null,
      reason: row.reason,
      status: row.status,
      decisionNote: row.decisionNote,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async request(actor: Actor, input: CorrectionInput): Promise<AttendanceCorrection> {
    const dateProblem = correctionDateProblem(input.workDate, todayIn());
    if (dateProblem) throw invalid(dateProblem, { workDate: dateProblem });
    if (!input.checkInAt && !input.checkOutAt)
      throw invalid('Give the check-in or check-out time to correct.', { checkInAt: 'Required.' });
    const now = Date.now() + 5 * 60_000;
    if ([input.checkInAt, input.checkOutAt].some((at) => at && Date.parse(at) > now))
      throw invalid('A time cannot be later than now.', { checkOutAt: 'Not yet.' });
    if (input.checkInAt && input.checkOutAt && input.checkOutAt <= input.checkInAt)
      throw invalid('Check-out must be after check-in.', { checkOutAt: 'After check-in.' });
    const times = {
      checkInAt: input.checkInAt ? new Date(input.checkInAt) : null,
      checkOutAt: input.checkOutAt ? new Date(input.checkOutAt) : null,
    };
    await assertDayFits(
      this.db,
      { userId: actor.userId, workDate: input.workDate, ...times },
      'request',
    );
    const [waiting] = await this.db
      .select({ id: attendanceCorrections.id })
      .from(attendanceCorrections)
      .where(
        and(
          eq(attendanceCorrections.userId, actor.userId),
          eq(attendanceCorrections.workDate, input.workDate),
          eq(attendanceCorrections.status, 'pending'),
        ),
      )
      .limit(1);
    if (waiting) throw conflict(ALREADY_PENDING, 'pending_exists');
    let row: { id: string } | undefined;
    try {
      [row] = await this.db
        .insert(attendanceCorrections)
        .values({ userId: actor.userId, workDate: input.workDate, ...times, reason: input.reason })
        .returning({ id: attendanceCorrections.id });
    } catch (error) {
      throw pendingClash(error) ?? error;
    }
    const [created] = await this.list(eq(attendanceCorrections.id, row?.id ?? ''));
    if (!created) throw new Error('Correction was not saved.');
    await notifyHolders(
      this.db,
      'leave.approve',
      STAFF_NOTICES.correctionRequested(created.id, actor.fullName, created.workDate),
      actor.userId,
    );
    return created;
  }

  async decide(
    actor: Actor,
    id: string,
    approve: boolean,
    note?: string | null,
  ): Promise<AttendanceCorrection> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(attendanceCorrections)
        .set({
          status: approve ? 'approved' : 'rejected',
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          decisionNote: note ?? null,
        })
        .where(and(eq(attendanceCorrections.id, id), eq(attendanceCorrections.status, 'pending')))
        .returning();
      if (!row) throw conflict('This correction has already been decided.', 'decided');
      if (row.userId === actor.userId)
        throw conflict('Someone else decides your own correction.', 'own');
      if (approve) {
        await assertDayFits(tx, row, 'approval');
        await applyCorrection(tx, row);
        // The day's travel is measured again for the corrected day (S3, S4); it keeps the
        // rate saved for the day, and a day with no check-out still is not saved.
        await takeTravelSnapshot(tx, row.userId, row.workDate);
      }
      await notify(
        tx,
        { userId: row.userId },
        STAFF_NOTICES.correctionDecided(id, approve, row.workDate),
      );
      await recordAudit(
        tx,
        actor.userId,
        `attendance.correction_${approve ? 'approved' : 'rejected'}`,
        'attendance_correction',
        id,
      );
    });
    const [decided] = await this.list(eq(attendanceCorrections.id, id));
    if (!decided) throw notFound('That correction');
    return decided;
  }
}

/**
 * Writes the approved times onto the day, or makes the day when none was recorded. `late`
 * is worked out again from the corrected check-in by the same rule as a live check-in
 * (live review A6, A7); a correction of the check-out alone leaves it as it was.
 */
async function applyCorrection(
  tx: Transaction,
  row: typeof attendanceCorrections.$inferSelect,
): Promise<void> {
  const late = row.checkInAt
    ? await isLateAt(tx, await loadPolicy(tx), row.checkInAt, row.workDate)
    : null;
  const [day] = await tx
    .update(attendanceDays)
    .set({
      ...(row.checkInAt ? { checkInAt: row.checkInAt, late: late ?? false } : {}),
      ...(row.checkOutAt ? { checkOutAt: row.checkOutAt } : {}),
      correctedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(attendanceDays.userId, row.userId), eq(attendanceDays.workDate, row.workDate)))
    .returning({ id: attendanceDays.id });
  if (day) await pruneDutyPoints(tx, day.id);
  if (day || !row.checkInAt) return;
  await tx.insert(attendanceDays).values({
    userId: row.userId,
    workDate: row.workDate,
    checkInAt: row.checkInAt,
    checkOutAt: row.checkOutAt,
    late: late ?? false,
    correctedAt: new Date(),
  });
}
