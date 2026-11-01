import { Controller, Get, Header, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { paymentLinks, paymentMilestones, projects } from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { Public } from '../../common/auth/auth.decorators';
import { DATABASE, type Database } from '../../config/core.module';
import { PAYMENT_GATEWAY, type PaymentGateway } from './gateway';
import { GatewayPaymentsService } from './gateway-payments.service';

const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;color:#14181c}h1{font-size:1.4rem}button{font:inherit;padding:.75rem 1.25rem;border:0;border-radius:.6rem;background:#0b6fa4;color:#fff}small{color:#5a6570}</style></head><body>${body}</body></html>`;

/**
 * The sandbox stand-in for Razorpay's payment page, for testing without keys. Paying
 * runs the same path as a real webhook, with a 2% fee plus GST like Razorpay's.
 */
@Public()
@Controller('v1/pay/sandbox')
export class SandboxPayController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly payments: GatewayPaymentsService,
  ) {}

  @Get(':id')
  @Header('content-type', 'text/html; charset=utf-8')
  async show(@Param('id') id: string): Promise<string> {
    const link = await this.load(id);
    if (link.status !== 'created' && link.status !== 'partly_paid')
      return page('Link closed', `<h1>This link is ${link.status.replace('_', ' ')}</h1>`);
    return page(
      'Test payment',
      `<h1>Pay ${formatInr(link.amountPaise)}</h1><p>${link.code} · ${link.label}</p><form method="post"><button type="submit">Pay now (test)</button></form><p><small>Sandbox: no money moves. Razorpay replaces this page once the keys are added.</small></p>`,
    );
  }

  @Post(':id')
  @Header('content-type', 'text/html; charset=utf-8')
  async pay(@Param('id') id: string): Promise<string> {
    const link = await this.load(id);
    const fee = Math.round(link.amountPaise * 0.02);
    const outcome = await this.payments.recordLinkPayment({
      providerLinkId: id,
      gatewayPaymentId: `pay_sandbox_${Date.now().toString(36)}`,
      amountPaise: link.amountPaise - link.paidPaise,
      feePaise: fee + Math.round(fee * 0.18),
      paidAt: new Date(),
    });
    return page('Paid', `<h1>Paid (test)</h1><p>${outcome}. You can close this page.</p>`);
  }

  private async load(id: string) {
    if (this.gateway.mode !== 'sandbox') throw new NotFoundException();
    const [row] = await this.db
      .select({
        status: paymentLinks.status,
        amountPaise: paymentLinks.amountPaise,
        paidPaise: paymentLinks.paidPaise,
        code: projects.code,
        label: paymentMilestones.label,
      })
      .from(paymentLinks)
      .innerJoin(projects, eq(projects.id, paymentLinks.projectId))
      .innerJoin(paymentMilestones, eq(paymentMilestones.id, paymentLinks.milestoneId))
      .where(eq(paymentLinks.providerLinkId, id))
      .limit(1);
    if (!row) throw new NotFoundException();
    return row;
  }
}
