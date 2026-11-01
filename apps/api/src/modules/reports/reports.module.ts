import { Module } from '@nestjs/common';
import { ReportStatusService } from './report-status.service';

@Module({ providers: [ReportStatusService], exports: [ReportStatusService] })
export class ReportsModule {}
