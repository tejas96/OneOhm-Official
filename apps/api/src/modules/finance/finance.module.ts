import { Module } from '@nestjs/common';
import { CustomerPortalModule } from '../customer-portal/customer-portal.module';
import { ProjectsModule } from '../projects/projects.module';
import { ReportsModule } from '../reports/reports.module';
import { BillingController } from './billing.controller';
import { CashHandlingController } from './cash-handling.controller';
import { CashHandlingService } from './cash-handling.service';
import { CustomerBillingController } from './customer-billing.controller';
import { CustomerBillingService } from './customer-billing.service';
import { CustomerMoneyService } from './customer-money.service';
import { FinanceController } from './finance.controller';
import { FinanceOverviewService } from './finance-overview.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoicesService } from './invoices.service';
import { LedgerReadService } from './ledger-read.service';
import { LedgerSyncService } from './ledger-sync.service';
import { LendersService } from './lenders.service';
import { LoansService } from './loans.service';
import { PayablesService } from './payables.service';
import { PaymentReversalService } from './payment-reversal.service';
import { PaymentsReadService } from './payments-read.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { ReceivablesService } from './receivables.service';

/**
 * Receivables, payables, loans, receipts, tax invoices, customer credit and refunds,
 * and the double-entry ledger (PRD 3.11).
 */
@Module({
  imports: [ProjectsModule, ReportsModule, CustomerPortalModule],
  controllers: [
    FinanceController,
    BillingController,
    CustomerBillingController,
    CashHandlingController,
  ],
  providers: [
    FinanceOverviewService,
    ReceivablesService,
    PaymentsReadService,
    PaymentReversalService,
    ReceiptPdfService,
    InvoicesService,
    InvoicePdfService,
    CustomerMoneyService,
    CustomerBillingService,
    PayablesService,
    LoansService,
    LendersService,
    LedgerReadService,
    LedgerSyncService,
    CashHandlingService,
  ],
  exports: [ReceiptPdfService, CustomerBillingService],
})
export class FinanceModule {}
