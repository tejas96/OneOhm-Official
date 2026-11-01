import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { pdfBody } from '../reports/reports.controller';
import { FinanceOverviewService } from './finance-overview.service';
import { LedgerReadService } from './ledger-read.service';
import { LendersService } from './lenders.service';
import { LoansService } from './loans.service';
import { PayablesService } from './payables.service';
import { PaymentReversalService } from './payment-reversal.service';
import { PaymentsReadService } from './payments-read.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { ReceivablesService } from './receivables.service';

@Controller()
export class FinanceController {
  constructor(
    private readonly overview: FinanceOverviewService,
    private readonly receivables: ReceivablesService,
    private readonly payments: PaymentsReadService,
    private readonly reversals: PaymentReversalService,
    private readonly receipts: ReceiptPdfService,
    private readonly payables: PayablesService,
    private readonly loans: LoansService,
    private readonly lenders: LendersService,
    private readonly ledger: LedgerReadService,
  ) {}

  @TsRestHandler(apiContract.finance)
  handler(@CurrentActor() actor: Actor) {
    const view = () => assertCan(actor, 'finance.view', 'finance.record_payments');
    const loanWork = () => assertCan(actor, 'loans.manage', 'finance.record_payments');
    return tsRestHandler(apiContract.finance, {
      getOverview: async () => {
        view();
        return { status: 200, body: await this.overview.get() };
      },
      listReceivables: async () => {
        view();
        return { status: 200, body: await this.receivables.list() };
      },
      listPayments: async ({ query }) => {
        view();
        return { status: 200, body: await this.payments.list(query.limit) };
      },
      reversePayment: async ({ params, body }) => {
        assertCan(actor, 'finance.approve_payments');
        return { status: 201, body: await this.reversals.reverse(actor, params.id, body.reason) };
      },
      paymentReceipt: async ({ params, query }) => {
        view();
        return {
          status: 200,
          body: pdfBody(await this.receipts.render(params.id), query.disposition),
        };
      },
      listPayables: async ({ query }) => {
        view();
        return { status: 200, body: await this.payables.list(query.status) };
      },
      createPayable: async ({ body }) => {
        assertCan(actor, 'finance.record_payments');
        return { status: 201, body: await this.payables.create(actor, body) };
      },
      reviewPayable: async ({ params, body }) => {
        assertCan(actor, 'finance.record_payments', 'finance.approve_payments');
        return { status: 200, body: await this.payables.review(actor, params.id, body) };
      },
      approvePayable: async ({ params }) => {
        assertCan(actor, 'finance.approve_payments');
        return { status: 200, body: await this.payables.approve(actor, params.id) };
      },
      payPayable: async ({ params, body }) => {
        assertCan(actor, 'finance.record_payments');
        return { status: 200, body: await this.payables.pay(actor, params.id, body) };
      },
      listLoans: async () => {
        assertCan(actor, 'finance.view', 'loans.manage');
        return { status: 200, body: await this.loans.list() };
      },
      saveLoan: async ({ params, body }) => {
        loanWork();
        return { status: 200, body: await this.loans.save(actor, params.projectId, body) };
      },
      recordDisbursement: async ({ params, body }) => {
        assertCan(actor, 'finance.record_payments');
        return {
          status: 201,
          body: await this.loans.recordDisbursement(actor, params.projectId, body),
        };
      },
      listLenders: async () => {
        assertCan(actor, 'finance.view', 'loans.manage', 'projects.create');
        return { status: 200, body: await this.lenders.list() };
      },
      createLender: async ({ body }) => {
        loanWork();
        return { status: 201, body: await this.lenders.create(actor, body) };
      },
      updateLender: async ({ params, body }) => {
        loanWork();
        return { status: 200, body: await this.lenders.update(actor, params.id, body) };
      },
      listJournal: async ({ query }) => {
        view();
        return { status: 200, body: await this.ledger.journal(query) };
      },
      trialBalance: async () => {
        view();
        return { status: 200, body: await this.ledger.trialBalance() };
      },
    });
  }
}
