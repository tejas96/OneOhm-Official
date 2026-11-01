import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Public } from '../../common/auth/auth.decorators';
import { DATABASE, type Database } from '../../config/core.module';

@Controller('v1/health')
export class HealthController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Public()
  @Get('ready')
  async ready(): Promise<{ status: 'ready' }> {
    await this.db.execute(sql`select 1`);
    return { status: 'ready' };
  }
}
