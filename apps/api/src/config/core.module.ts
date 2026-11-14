import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { createDatabaseConnection, type Database, type DatabaseConnection } from '@oneohm/database';
import { loadCalendar } from '../common/calendar';
import { type Environment, loadEnvironment } from './environment';

export const ENVIRONMENT = Symbol('ENVIRONMENT');
export const DATABASE = Symbol('DATABASE');
const CONNECTION = Symbol('CONNECTION');

/** Environment and the database pool, available everywhere. */
@Global()
@Module({
  providers: [
    { provide: ENVIRONMENT, useFactory: () => loadEnvironment() },
    {
      provide: CONNECTION,
      inject: [ENVIRONMENT],
      useFactory: (env: Environment) => createDatabaseConnection(env.DATABASE_URL),
    },
    {
      provide: DATABASE,
      inject: [CONNECTION],
      useFactory: (connection: DatabaseConnection) => connection.db,
    },
  ],
  exports: [ENVIRONMENT, DATABASE],
})
export class CoreModule implements OnModuleInit, OnApplicationShutdown {
  private refresh: NodeJS.Timeout | undefined;

  constructor(
    @Inject(CONNECTION) private readonly connection: DatabaseConnection,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  /** Reads the business calendar now and every half minute, for the customer texts. */
  async onModuleInit(): Promise<void> {
    const read = () =>
      loadCalendar(this.connection.db, this.env.BUSINESS_TIMEZONE).catch(() => undefined);
    await read();
    this.refresh = setInterval(read, 30_000);
    this.refresh.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.refresh);
    await this.connection.close();
  }
}

export type { Database };
