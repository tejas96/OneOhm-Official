import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDatabaseConnection, type Database, type DatabaseConnection } from '@oneohm/database';
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
export class CoreModule implements OnApplicationShutdown {
  constructor(@Inject(CONNECTION) private readonly connection: DatabaseConnection) {}

  async onApplicationShutdown(): Promise<void> {
    await this.connection.close();
  }
}

export type { Database };
