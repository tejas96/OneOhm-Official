import { Inject, Injectable } from '@nestjs/common';
import {
  type DatabaseExecutor,
  personName,
  projectActivities,
  raiseDutyAlert,
  settleVisitProof,
  siteVisits,
} from '@oneohm/database';
import { and, eq, isNull } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { sayWithTaps } from '../whatsapp/assistant/closing-taps';
import type { Conversation } from '../whatsapp/chat-store';
import type { VisitCheckTap } from './visit-check-taps';
import { jobTarget, type NewsTarget } from './visit-news-target';
import { VISIT_NEWS_WORDS } from './visit-news-words';

type VisitRow = typeof siteVisits.$inferSelect;

/**
 * The customer's answer to "Was this visit done?" (Duty Day step 6), the strongest visit proof.
 * Only the visit's own customer can answer, and only once: the first answer is kept. Yes
 * verifies the visit (unless GPS was faked); No makes it doubtful and raises a red alert for
 * the worker's manager, with Call and Open visit.
 */
@Injectable()
export class VisitCheckAnswersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async tapped(chat: Conversation, customerId: string, tap: VisitCheckTap): Promise<void> {
    const words = VISIT_NEWS_WORDS;
    const [row] = await this.db
      .select()
      .from(siteVisits)
      .where(eq(siteVisits.id, tap.siteVisitId))
      .limit(1);
    const target =
      row &&
      (await jobTarget(this.db, { taskId: row.taskId, serviceRequestId: row.serviceRequestId }));
    // Someone else's visit (a forwarded message, another number) looks like no visit at all.
    if (!row || !target || target.customerId !== customerId)
      return sayWithTaps(this.db, chat, words.unknown, ['menu']);
    if (row.customerSaid) return sayWithTaps(this.db, chat, words.already, ['menu']);
    const saved = await this.db.transaction((tx) => this.save(tx, row, target, tap.said));
    const reply = !saved ? words.already : tap.said === 'yes' ? words.thanks : words.sorry;
    await sayWithTaps(this.db, chat, reply, ['menu']);
  }

  /** Keeps the first answer, works the proof out again, and on No tells the manager. */
  private async save(
    tx: DatabaseExecutor,
    row: VisitRow,
    target: NewsTarget,
    said: 'yes' | 'no',
  ): Promise<boolean> {
    const now = new Date();
    const [kept] = await tx
      .update(siteVisits)
      .set({ customerSaid: said, customerSaidAt: now, customerCheckDueAt: null, updatedAt: now })
      .where(and(eq(siteVisits.id, row.id), isNull(siteVisits.customerSaid)))
      .returning({ id: siteVisits.id });
    if (!kept) return false;
    // The red alert below tells the manager about a No; the doubtful alert stays quiet.
    await settleVisitProof(tx, row.id, now, { notify: said === 'yes' });
    const worker = await personName(tx, row.userId);
    if (row.projectId)
      await tx.insert(projectActivities).values({
        projectId: row.projectId,
        taskId: row.taskId,
        kind: 'visit_customer_answer',
        message:
          said === 'yes'
            ? `${target.customerName} confirmed on WhatsApp that ${worker} visited.`
            : `${target.customerName} said on WhatsApp that ${worker} did not visit.`,
        userId: null,
        data: { visitId: row.id, said },
      });
    if (said === 'no') await this.alertNo(tx, row, target, worker);
    return true;
  }

  private async alertNo(tx: DatabaseExecutor, row: VisitRow, target: NewsTarget, worker: string) {
    await raiseDutyAlert(tx, {
      kind: 'visit_customer_no',
      personId: row.userId,
      subjectType: 'site_visit',
      subjectId: row.id,
      day: row.workDate,
      title: `Customer says ${worker} did not visit ${target.home}`,
      body: `${target.customerName} (${target.label}) tapped No on "Was this visit done?". Call them.`,
      detail: {
        visitId: row.id,
        label: target.label,
        customerName: target.customerName,
        customerPhone: target.phone,
        home: target.home,
      },
      ...(row.taskId
        ? { opens: { type: 'task' as const, id: row.taskId, projectId: row.projectId } }
        : row.serviceRequestId
          ? { opens: { type: 'service_request' as const, id: row.serviceRequestId } }
          : {}),
    });
  }
}
