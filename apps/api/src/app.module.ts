import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { TsRestModule } from '@ts-rest/nest';
import { SessionGuard } from './common/auth/session.guard';
import { ErrorFilter } from './common/http/error.filter';
import { CoreModule } from './config/core.module';
import { AuthModule } from './modules/auth/auth.module';
import { FEATURE_MODULES } from './modules/feature-modules';
import { HealthController } from './modules/health/health.controller';

@Module({
  imports: [
    CoreModule,
    TsRestModule.register({ isGlobal: true, validateResponses: true, jsonQuery: false }),
    AuthModule,
    ...FEATURE_MODULES,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: ErrorFilter },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule {}
