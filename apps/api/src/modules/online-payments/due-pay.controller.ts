import { Controller, Get, Inject, Param, Post, Query, Res } from '@nestjs/common';
import { formatInr } from '@oneohm/shared';
import type { Response } from 'express';
import { Public } from '../../common/auth/auth.decorators';
import { AppError } from '../../common/http/errors';
import { ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { CustomerPayService } from './customer-pay.service';
import { type PayToken, readPayTokenFor } from './pay-token';

/** What the customer reads when a pay link cannot open a payment page. */
const WORDS = {
  expired: 'This link has expired. Open the OneOhm app, or ask us on WhatsApp for a new one.',
  title: 'Solar payment',
  ask: (amount: string, label: string) => `Pay ${amount} to OneOhm for ${label}.`,
  go: 'Continue to pay',
  byCode: {
    not_due: 'This payment is not due yet. We will tell you when it is.',
    paid: 'This is already paid. Thank you!',
    bank_share: 'Your bank pays this share directly. Nothing to pay here.',
    off: 'Online payment is not available right now. Please call your contact.',
  } as Readonly<Record<string, string>>,
} as const;

const page = (body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${WORDS.title}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;color:#14181c}button{font:inherit;padding:.75rem 1.25rem;border:0;border-radius:.6rem;background:#0b6fa4;color:#fff}</style></head><body>${body}</body></html>`;

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * The pay link in a "payment due" message (PRD 6.2). Opening it only shows what is owed,
 * so a link preview or a scanner makes nothing at the gateway; Continue (a POST, or the
 * same link with ?go=1) makes or reuses the Razorpay link and opens it. Paid, not due or
 * the bank's share say so.
 */
@Public()
@Controller('v1/pay/due')
export class DuePayController {
  constructor(
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly pay: CustomerPayService,
  ) {}

  @Get(':token')
  async open(
    @Param('token') token: string,
    @Query('go') go: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    if (go === '1') return this.continue(token, response);
    await this.answer(token, response, async (due) => {
      const owed = await this.pay.preview(due.customerId, due.milestoneId);
      const ask = escapeHtml(WORDS.ask(formatInr(owed.amountPaise), owed.label));
      response
        .status(200)
        .type('html')
        .send(
          page(
            `<p>${ask}</p><form method="post"><button type="submit">${WORDS.go}</button></form>`,
          ),
        );
    });
  }

  @Post(':token')
  async continue(@Param('token') token: string, @Res() response: Response): Promise<void> {
    await this.answer(token, response, async (due) => {
      const link = await this.pay.pay(due.customerId, due.milestoneId);
      response.redirect(303, link.url);
    });
  }

  /** Reads the token, then runs `then`; a refusal becomes a calm page, not an error. */
  private async answer(
    token: string,
    response: Response,
    then: (due: PayToken) => Promise<void>,
  ): Promise<void> {
    const due = readPayTokenFor(this.env, token);
    if (!due) {
      response
        .status(410)
        .type('html')
        .send(page(`<p>${WORDS.expired}</p>`));
      return;
    }
    try {
      await then(due);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      const words = WORDS.byCode[error.code] ?? escapeHtml(error.message);
      response
        .status(200)
        .type('html')
        .send(page(`<p>${words}</p>`));
    }
  }
}
