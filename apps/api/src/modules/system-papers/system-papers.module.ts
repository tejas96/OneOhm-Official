import { Module } from '@nestjs/common';
import { WorkOrderPdfService } from '../contractors/work-order-pdf.service';
import { DocumentsModule } from '../documents/documents.module';
import { InvoicePdfService } from '../finance/invoice-pdf.service';
import { ReceiptPdfService } from '../finance/receipt-pdf.service';
import { ReportsModule } from '../reports/reports.module';
import { SystemPapersService } from './system-papers.service';

/**
 * Files OneOhm's own PDFs in the documents (PRD 3.14). The invoice, receipt and work
 * order printers are plain services, provided here again so this module needs nothing
 * from finance or contractors beyond their code.
 */
@Module({
  imports: [ReportsModule, DocumentsModule],
  providers: [SystemPapersService, InvoicePdfService, ReceiptPdfService, WorkOrderPdfService],
})
export class SystemPapersModule {}
