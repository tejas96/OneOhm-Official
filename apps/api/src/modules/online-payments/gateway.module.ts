import { Global, Module } from '@nestjs/common';
import { ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { createGateway, PAYMENT_GATEWAY } from './gateway';

/** The payment gateway, shared so recording any payment can close open links. */
@Global()
@Module({
  providers: [
    {
      provide: PAYMENT_GATEWAY,
      inject: [ENVIRONMENT],
      useFactory: (env: Environment) => createGateway(env),
    },
  ],
  exports: [PAYMENT_GATEWAY],
})
export class GatewayModule {}
