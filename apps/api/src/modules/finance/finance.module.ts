import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { ReportsModule } from '../reports/reports.module';
import { FinanceController } from './finance.controller';
import { FinanceOverviewService } from './finance-overview.service';
import { LedgerReadService } from './ledger-read.service';
import { LedgerSyncService } from './ledger-sync.service';
import { LendersService } from './lenders.service';
import { LoansService } from './loans.service';
import { PayablesService } from './payables.service';
import { PaymentReversalService } from './payment-reversal.service';
import { PaymentsReadService } from './payments-read.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { ReceivablesService } from './receivables.service';

/** Receivables, payables, loans, receipts and the double-entry ledger (PRD 3.11). */
@Module({
  imports: [ProjectsModule, ReportsModule],
  controllers: [FinanceController],
  providers: [
    FinanceOverviewService,
    ReceivablesService,
    PaymentsReadService,
    PaymentReversalService,
    ReceiptPdfService,
    PayablesService,
    LoansService,
    LendersService,
    LedgerReadService,
    LedgerSyncService,
  ],
})
export class FinanceModule {}
