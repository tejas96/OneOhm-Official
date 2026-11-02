import { Inject, Injectable } from '@nestjs/common';
import type { AttendanceCorrection } from '@oneohm/api-contracts';
import {
  attendanceCorrections,
  attendanceDays,
  notify,
  notifyHolders,
  type Transaction,
  users,
} from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { STAFF_NOTICES } from '../../common/notices';
import { DATABASE, type Database } from '../../config/core.module';

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
    if (input.workDate > todayIn())
      throw invalid('Pick today or an earlier day.', { workDate: 'Not yet.' });
    if (!input.checkInAt && !input.checkOutAt)
      throw invalid('Give the check-in or check-out time to correct.', { checkInAt: 'Required.' });
    const now = Date.now() + 5 * 60_000;
    if ([input.checkInAt, input.checkOutAt].some((at) => at && Date.parse(at) > now))
      throw invalid('A time cannot be later than now.', { checkOutAt: 'Not yet.' });
    if (input.checkInAt && input.checkOutAt && input.checkOutAt <= input.checkInAt)
      throw invalid('Check-out must be after check-in.', { checkOutAt: 'After check-in.' });
    const [row] = await this.db
      .insert(attendanceCorrections)
      .values({
        userId: actor.userId,
        workDate: input.workDate,
        checkInAt: input.checkInAt ? new Date(input.checkInAt) : null,
        checkOutAt: input.checkOutAt ? new Date(input.checkOutAt) : null,
        reason: input.reason,
      })
      .returning({ id: attendanceCorrections.id });
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
      if (approve) await applyCorrection(tx, row);
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

/** Writes the approved times onto the day, or makes the day when none was recorded. */
async function applyCorrection(
  tx: Transaction,
  row: typeof attendanceCorrections.$inferSelect,
): Promise<void> {
  const [day] = await tx
    .update(attendanceDays)
    .set({
      ...(row.checkInAt ? { checkInAt: row.checkInAt, late: false } : {}),
      ...(row.checkOutAt ? { checkOutAt: row.checkOutAt } : {}),
      correctedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(attendanceDays.userId, row.userId), eq(attendanceDays.workDate, row.workDate)))
    .returning({ id: attendanceDays.id });
  if (day || !row.checkInAt) return;
  await tx.insert(attendanceDays).values({
    userId: row.userId,
    workDate: row.workDate,
    checkInAt: row.checkInAt,
    checkOutAt: row.checkOutAt,
    correctedAt: new Date(),
  });
}
