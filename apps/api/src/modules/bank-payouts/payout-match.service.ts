import { Inject, Injectable } from '@nestjs/common';
import type { PayoutMatch } from '@oneohm/api-contracts';
import { bankPayouts } from '@oneohm/database';
import { comparePayouts, type OurPayoutRow } from '@oneohm/domain';
import { and, eq, gte } from 'drizzle-orm';
import { type Actor, assertCan } from '../../common/auth/actor';
import { conflict } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { PAYOUT_GATEWAY, type PayoutGateway } from './payout-gateway';

const LINES_SHOWN = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "Check against RazorpayX": our transfers beside RazorpayX's own list. */
@Injectable()
export class PayoutMatchService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PAYOUT_GATEWAY) private readonly gateway: PayoutGateway,
  ) {}

  async report(actor: Actor, days: number, now = new Date()): Promise<PayoutMatch> {
    assertCan(actor, 'finance.view', 'finance.approve_payments');
    if (this.gateway.mode === 'off')
      throw conflict('Bank transfers are off, so there is nothing to check.', 'payouts_off');
    const from = new Date(now.getTime() - days * DAY_MS);
    const ours: OurPayoutRow[] = await this.db
      .select({
        id: bankPayouts.id,
        payableId: bankPayouts.payableId,
        providerPayoutId: bankPayouts.providerPayoutId,
        status: bankPayouts.status,
        amountPaise: bankPayouts.amountPaise,
        feePaise: bankPayouts.feePaise,
      })
      .from(bankPayouts)
      .where(
        and(eq(bankPayouts.provider, this.gateway.provider), gte(bankPayouts.createdAt, from)),
      );
    // Practice mode has no RazorpayX: our own rows stand in, so the report always matches.
    const remote = await this.gateway.listPayouts({ from, to: now });
    const result = comparePayouts(
      ours,
      remote ??
        ours.map((row) => ({
          id: row.providerPayoutId ?? row.id,
          referenceId: row.id,
          status: row.status,
          amountPaise: row.amountPaise,
          feePaise: row.feePaise,
        })),
    );
    return {
      days,
      matched: result.matched,
      counts: { ...result.counts },
      lines: result.lines.slice(0, LINES_SHOWN).map(({ kind, payableId, text }) => ({
        kind,
        payableId,
        text,
      })),
      truncated: result.lines.length > LINES_SHOWN,
      practice: remote === null,
    };
  }
}
