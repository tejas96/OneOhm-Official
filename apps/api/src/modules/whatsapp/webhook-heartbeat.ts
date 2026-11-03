import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { noteBackgroundRun, notifyHolders, outbox, waMessages } from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, eq, gt, sql } from 'drizzle-orm';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';

const SILENT_HOURS = 24;
/** The alert owners get: plain words, what to check. */
export const WEBHOOK_SILENT_TITLE = 'No WhatsApp webhooks for 24 hours — check the connection';
const EVERY_MINUTES = 60;
const HOUR = 3_600_000;

/** When Meta last called the webhook: a customer message or a delivery receipt. */
export interface WebhookSeen {
  readonly latestInboundAt: Date | null;
  readonly latestDeliveredAt: Date | null;
  /** WhatsApp messages sent in the last 24 hours. */
  readonly sentSince: number;
}

/**
 * The webhook looks cut off when Meta called it neither with a message nor a delivery
 * receipt for a day while messages went out: that usually means the webhook URL broke.
 */
export function webhookLooksSilent(seen: WebhookSeen, now: Date): boolean {
  if (seen.sentSince === 0) return false;
  const last = Math.max(
    seen.latestInboundAt?.getTime() ?? 0,
    seen.latestDeliveredAt?.getTime() ?? 0,
  );
  return now.getTime() - last > SILENT_HOURS * HOUR;
}

/**
 * Checks every hour, with live WhatsApp only, that inbound messages still arrive (A14). If
 * not, the people who manage settings get one alert a day to check the webhook.
 */
@Injectable()
export class WebhookHeartbeatService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('WhatsAppHeartbeat');
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.WHATSAPP_DELIVERY !== 'live') return;
    this.timer = setInterval(() => void this.run(), EVERY_MINUTES * 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Returns true when the alert went out (or was already sent today). */
  async run(now: Date = new Date()): Promise<boolean> {
    try {
      const since = new Date(now.getTime() - SILENT_HOURS * HOUR);
      const [inbound] = await this.db
        .select({ at: sql<Date | null>`max(${waMessages.createdAt})` })
        .from(waMessages)
        .where(eq(waMessages.direction, 'in'));
      const [sent] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(outbox)
        .where(
          and(eq(outbox.channel, 'whatsapp'), eq(outbox.status, 'sent'), gt(outbox.sentAt, since)),
        );
      const [delivered] = await this.db
        .select({ at: sql<Date | null>`max(${outbox.deliveredAt})` })
        .from(outbox)
        .where(eq(outbox.channel, 'whatsapp'));
      const seen: WebhookSeen = {
        latestInboundAt: inbound?.at ? new Date(inbound.at) : null,
        latestDeliveredAt: delivered?.at ? new Date(delivered.at) : null,
        sentSince: sent?.count ?? 0,
      };
      if (!webhookLooksSilent(seen, now)) return false;
      await notifyHolders(this.db, 'settings.manage', {
        kind: 'whatsapp_webhook_silent',
        title: WEBHOOK_SILENT_TITLE,
        body: 'Messages are going out, but no customer message or delivery receipt has come in for a day. Check the WhatsApp webhook URL in the Meta app settings.',
        dedupeKey: `whatsapp_webhook_silent:${todayIn('Asia/Kolkata', now)}`,
      });
      await noteBackgroundRun(this.db, 'whatsapp_heartbeat', { count: 1 });
      return true;
    } catch (error) {
      this.log.error(`Heartbeat check failed: ${error instanceof Error ? error.message : error}`);
      await noteBackgroundRun(this.db, 'whatsapp_heartbeat', { error });
      return false;
    }
  }
}
