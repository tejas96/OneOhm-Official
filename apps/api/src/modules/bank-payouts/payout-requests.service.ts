import { Inject, Injectable } from '@nestjs/common';
import type { PayoutRequest } from '@oneohm/api-contracts';
import { notify, payoutRequests } from '@oneohm/database';
import { partPaymentProblem } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan, can } from '../../common/auth/actor';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { billOf, tellFinance } from './payout-alerts';
import { PAYOUT_GATEWAY, type PayoutGateway } from './payout-gateway';
import { payoutOptionsFor } from './payout-options';
import { closeRequest, openRequestOf, presentRequest } from './payout-requests';
import { PROBLEM_TEXT } from './payout-rules';

const isUniqueViolation = (error: unknown): boolean => {
  const code = (value: unknown) =>
    typeof value === 'object' && value !== null ? (value as { code?: string }).code : undefined;
  return code(error) === '23505' || code((error as { cause?: unknown })?.cause) === '23505';
};

/**
 * "Ask to send": a person who records payments, but may not send money, asks an approver
 * to send a bank transfer. The approver sees it in Approvals and on the bill, and sends it
 * (or declines with a note). One open ask per bill.
 */
@Injectable()
export class PayoutRequestsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PAYOUT_GATEWAY) private readonly gateway: PayoutGateway,
  ) {}

  async ask(actor: Actor, payableId: string, amountPaise?: number): Promise<PayoutRequest> {
    assertCan(actor, 'finance.record_payments');
    if (can(actor, 'finance.approve_payments')) {
      throw conflict('You can send this bank transfer yourself.', 'can_send');
    }
    const options = await payoutOptionsFor(this.db, this.gateway, actor, payableId);
    if (options.problem) {
      throw conflict(options.problemText ?? PROBLEM_TEXT[options.problem], options.problem);
    }
    const asked = amountPaise ?? options.leftPaise;
    const tooMuchOrLittle = partPaymentProblem(asked, options.leftPaise);
    if (tooMuchOrLittle) throw invalid(tooMuchOrLittle, { amountPaise: tooMuchOrLittle });
    const [row] = await this.db
      .insert(payoutRequests)
      .values({ payableId, amountPaise: asked, requestedByUserId: actor.userId })
      .returning()
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw conflict(
            'Someone has already asked to send this bill. Take that ask back first.',
            'already_requested',
          );
        }
        throw error;
      });
    if (!row) throw new Error('Request insert returned nothing');
    const payee = options.payee?.name ?? 'the payee';
    await recordAudit(this.db, actor.userId, 'payout.requested', 'payable', payableId, {
      requestId: row.id,
      amountPaise: asked,
      to: payee,
    });
    await tellFinance(
      this.db,
      await billOf(this.db, payableId),
      {
        kind: 'payout_requested',
        title: `${actor.fullName} asks to send ${formatInr(asked)} to ${payee}`,
        body: 'Open the bill or Approvals to send it, or say no with a note.',
        dedupeKey: `payout_requested:${row.id}`,
      },
      { exceptUserId: actor.userId },
    );
    return presentRequest(this.db, row, actor.userId);
  }

  /** The asker takes it back, or an approver clears it. */
  async withdraw(actor: Actor, payableId: string): Promise<void> {
    assertCan(actor, 'finance.record_payments', 'finance.approve_payments');
    const open = await openRequestOf(this.db, payableId);
    if (!open) throw notFound('An ask to send');
    const mine = open.requestedByUserId === actor.userId;
    if (!mine && !can(actor, 'finance.approve_payments')) {
      throw forbidden('Only the person who asked, or an approver, can take this back.');
    }
    if (!(await closeRequest(this.db, open.id, 'withdrawn', actor.userId))) {
      throw notFound('An ask to send');
    }
    await recordAudit(this.db, actor.userId, 'payout.request_withdrawn', 'payable', payableId, {
      requestId: open.id,
      amountPaise: open.amountPaise,
      askedByUserId: open.requestedByUserId,
    });
  }

  /** An approver says no, and the asker is told why. */
  async decline(actor: Actor, payableId: string, note: string): Promise<void> {
    assertCan(actor, 'finance.approve_payments');
    const open = await openRequestOf(this.db, payableId);
    if (!open) throw notFound('An ask to send');
    if (open.requestedByUserId === actor.userId) {
      throw forbidden('This is your own ask. Take it back instead.');
    }
    if (!(await closeRequest(this.db, open.id, 'declined', actor.userId, note))) {
      throw notFound('An ask to send');
    }
    await recordAudit(this.db, actor.userId, 'payout.request_declined', 'payable', payableId, {
      requestId: open.id,
      amountPaise: open.amountPaise,
      askedByUserId: open.requestedByUserId,
      note,
    });
    if (open.requestedByUserId) {
      const bill = await billOf(this.db, payableId);
      await notify(
        this.db,
        { userId: open.requestedByUserId },
        {
          kind: 'payout_request_declined',
          title: `${actor.fullName} did not send ${formatInr(open.amountPaise)} to ${bill.name}`,
          body: note,
          subject: { type: 'payable', id: payableId, projectId: bill.projectId },
          dedupeKey: `payout_request_declined:${open.id}`,
        },
      );
    }
  }
}
