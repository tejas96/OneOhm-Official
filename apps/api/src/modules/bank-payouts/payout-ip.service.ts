import { Inject, Injectable } from '@nestjs/common';
import type { PayoutIp } from '@oneohm/api-contracts';
import { bankPayouts } from '@oneohm/database';
import { and, eq, max } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { IP_NOT_ALLOWED_TEXT } from './payout-errors';
import { PAYOUT_GATEWAY, type PayoutGateway } from './payout-gateway';

const HOUR_MS = 60 * 60 * 1000;
const IP_LOOKUP_URL = 'https://api.ipify.org?format=json';
const LOOKS_LIKE_IP = /^[0-9a-f:.]{3,45}$/i;

/** This server's public address, once an hour at most. Null when unknown; never throws. */
export async function lookUpServerIp(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetcher(IP_LOOKUP_URL, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return null;
    const { ip } = (await response.json()) as { ip?: unknown };
    return typeof ip === 'string' && LOOKS_LIKE_IP.test(ip) ? ip : null;
  } catch {
    return null;
  }
}

/**
 * What the owner's technical person needs to add the server to RazorpayX's allow-list:
 * the server's public IP (live mode only) and whether the last RazorpayX call was refused
 * for it (spec: IP allow-list).
 */
@Injectable()
export class PayoutIpService {
  private cached: { ip: string | null; at: number } | null = null;
  private inFlight: Promise<string | null> | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PAYOUT_GATEWAY) private readonly gateway: PayoutGateway,
  ) {}

  async serverIp(now = Date.now()): Promise<string | null> {
    if (this.gateway.mode !== 'live') return null;
    if (this.cached && now - this.cached.at < HOUR_MS) return this.cached.ip;
    this.inFlight ??= lookUpServerIp().then((ip) => {
      this.cached = { ip, at: Date.now() };
      this.inFlight = null;
      return ip;
    });
    return this.inFlight;
  }

  /** True when the newest RazorpayX error is the blocked-server one and nothing good followed. */
  async ipBlocked(setup: {
    lastCheckError: string | null;
    lastCheckAt: string | null;
    lastGoodPayoutAt: string | null;
  }): Promise<boolean> {
    if (setup.lastCheckError === IP_NOT_ALLOWED_TEXT) return true;
    if (this.gateway.mode !== 'live') return false;
    const [blocked] = await this.db
      .select({ at: max(bankPayouts.updatedAt) })
      .from(bankPayouts)
      .where(
        and(
          eq(bankPayouts.provider, 'razorpayx'),
          eq(bankPayouts.status, 'failed'),
          eq(bankPayouts.failureReason, IP_NOT_ALLOWED_TEXT),
        ),
      );
    if (!blocked?.at) return false;
    const after = Math.max(
      setup.lastGoodPayoutAt ? Date.parse(setup.lastGoodPayoutAt) : 0,
      !setup.lastCheckError && setup.lastCheckAt ? Date.parse(setup.lastCheckAt) : 0,
    );
    return blocked.at.getTime() > after;
  }

  async forSetup(setup: {
    lastCheckError: string | null;
    lastCheckAt: string | null;
    lastGoodPayoutAt: string | null;
  }): Promise<PayoutIp> {
    const [serverIp, ipBlocked] = await Promise.all([this.serverIp(), this.ipBlocked(setup)]);
    return { serverIp, ipBlocked };
  }
}
