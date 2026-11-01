import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/auth/auth.decorators';
import { AppError } from '../../common/http/errors';
import { ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { CustomerPayService } from './customer-pay.service';
import { readPayToken } from './pay-token';

/** What the customer reads when a pay link cannot open a payment page. */
const WORDS = {
  expired: 'This link has expired. Open the OneOhm app, or ask us on WhatsApp for a new one.',
  title: 'OneOhm payment',
  byCode: {
    not_due: 'This payment is not due yet. We will tell you when it is.',
    paid: 'This is already paid. Thank you!',
    bank_share: 'Your bank pays this share to OneOhm directly. Nothing to pay here.',
    off: 'Online payment is not available right now. Please call your OneOhm contact.',
  } as Readonly<Record<string, string>>,
} as const;

const page = (text: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${WORDS.title}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;color:#14181c}</style></head><body><p>${text}</p></body></html>`;

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * The pay link in a "payment due" message (PRD 6.2): opens the Razorpay page for what is
 * still owed, making the gateway link only now. Paid, not due or the bank's share say so.
 */
@Public()
@Controller('v1/pay/due')
export class DuePayController {
  constructor(
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly pay: CustomerPayService,
  ) {}

  @Get(':token')
  async open(@Param('token') token: string, @Res() response: Response): Promise<void> {
    const due = readPayToken(this.env.FILE_LINK_SECRET, token);
    if (!due) {
      response.status(410).type('html').send(page(WORDS.expired));
      return;
    }
    try {
      const link = await this.pay.pay(due.customerId, due.milestoneId);
      response.redirect(302, link.url);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      const words = WORDS.byCode[error.code] ?? escapeHtml(error.message);
      response.status(200).type('html').send(page(words));
    }
  }
}
