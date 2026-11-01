import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/** Owners and admins read who did what, and every sign-in try (PRD 7.3). */
@Module({ controllers: [AuditController], providers: [AuditService] })
export class AuditModule {}
