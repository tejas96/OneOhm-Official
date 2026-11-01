import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  noteBackgroundRun,
  paymentLinks,
  paymentMilestones,
  payments,
  projectActivities,
  projects,
} from '@oneohm/database';
import { FINAL_LINK_WINDOW_DAYS, finalCustomerMilestones, finalLinkDecision } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { and, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { PAYMENT_GATEWAY, type PaymentGateway } from './gateway';
import { PaymentLinksService } from './payment-links.service';

const EVERY_MS = 60_000;
/** After a failed attempt (gateway down, bad phone), wait this long before trying again. */
const RETRY_AFTER_MS = 30 * 60_000;

/**
 * Sends the customer's final payment link by itself once that milestone falls due (PRD
 * Flow D step 3): checked every minute, so it follows whatever made the milestone due
 * (a task finished or approved, a plan change), always after that change is saved. Only
 * with online payments on, only the customer's share, once per milestone: any link made
 * for it before (by finance, the WhatsApp assistant or here) means none is sent again.
 */
@Injectable()
export class FinalLinkService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('FinalPaymentLink');
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly failedAt = new Map<string, number>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly links: PaymentLinksService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.gateway.mode === 'off') return;
    this.timer = setInterval(() => void this.run(), EVERY_MS);
    setTimeout(() => void this.run(), 5_000).unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Returns how many final links were sent this round. */
  async run(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let sent = 0;
    try {
      for (const milestone of await this.candidates(now)) {
        if (Date.now() - (this.failedAt.get(milestone.id) ?? 0) < RETRY_AFTER_MS) continue;
        if (await this.send(milestone)) sent += 1;
      }
      await noteBackgroundRun(this.db, 'final_payment_links', { count: sent });
    } catch (error) {
      this.logger.error(`Final link check failed: ${message(error)}`);
      await noteBackgroundRun(this.db, 'final_payment_links', { error });
    } finally {
      this.running = false;
    }
    return sent;
  }

  /** Customer milestones that fell due lately, with no link yet, that the rule says to send. */
  private async candidates(now: Date) {
    const since = new Date(now.getTime() - FINAL_LINK_WINDOW_DAYS * 86_400_000);
    const rows = await this.db
      .select({
        milestone: paymentMilestones,
        paidPaise: sql<string>`coalesce((select sum(${payments.amountPaise}) from ${payments} where ${payments.milestoneId} = ${paymentMilestones.id}), 0)`,
        linked: sql<boolean>`exists (select 1 from ${paymentLinks} where ${paymentLinks.milestoneId} = ${paymentMilestones.id})`,
      })
      .from(paymentMilestones)
      .innerJoin(projects, eq(projects.id, paymentMilestones.projectId))
      .where(
        and(
          eq(paymentMilestones.payer, 'customer'),
          inArray(paymentMilestones.status, ['due', 'partly_paid']),
          gte(paymentMilestones.dueAt, since),
          ne(projects.status, 'cancelled'),
        ),
      );
    if (rows.length === 0) return [];
    const siblings = await this.db
      .select({
        id: paymentMilestones.id,
        projectId: paymentMilestones.projectId,
        payer: paymentMilestones.payer,
        position: paymentMilestones.position,
      })
      .from(paymentMilestones)
      .where(
        inArray(paymentMilestones.projectId, [
          ...new Set(rows.map((row) => row.milestone.projectId)),
        ]),
      );
    const final = finalCustomerMilestones(siblings);
    return rows.flatMap(({ milestone, paidPaise, linked }) => {
      const decision = finalLinkDecision(
        {
          onlinePayments: this.gateway.mode !== 'off',
          payer: milestone.payer,
          status: milestone.status,
          dueAt: milestone.dueAt,
          amountPaise: milestone.amountPaise,
          paidPaise: Number(paidPaise),
          final: final.has(milestone.id),
          linked,
        },
        now,
      );
      return decision.send ? [{ ...milestone, owedPaise: decision.amountPaise }] : [];
    });
  }

  /**
   * One link per milestone even with two API servers: the milestone is claimed with a
   * lock held while the link is made, and checked again for a link inside it.
   */
  private async send(milestone: typeof paymentMilestones.$inferSelect): Promise<boolean> {
    try {
      return await this.db.transaction(async (tx) => {
        const lock = await tx.execute<{ claimed: boolean }>(
          sql`select pg_try_advisory_xact_lock(hashtext('final_payment_link'), hashtext(${milestone.id})) as claimed`,
        );
        if (!lock.rows[0]?.claimed) return false;
        const [existing] = await tx
          .select({ id: paymentLinks.id })
          .from(paymentLinks)
          .where(eq(paymentLinks.milestoneId, milestone.id))
          .limit(1);
        if (existing) return false;
        const link = await this.links.create({ userId: null }, milestone.id);
        await tx.insert(projectActivities).values({
          projectId: milestone.projectId,
          kind: 'payment',
          message: `Payment link for ${milestone.label} (${formatInr(link.amountPaise)}) sent to the customer automatically.`,
          userId: null,
        });
        this.logger.log(`Sent the final payment link for milestone ${milestone.id}.`);
        return true;
      });
    } catch (error) {
      this.failedAt.set(milestone.id, Date.now());
      this.logger.warn(`Final link for milestone ${milestone.id} not sent: ${message(error)}`);
      return false;
    }
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
