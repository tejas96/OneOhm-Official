import { Controller, Inject } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { Public } from '../../common/auth/auth.decorators';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { apiContract } from '../../contract';
import { readTrack } from './track-read';

/**
 * The customer's "Track live" page data (Duty Day step 6): no sign-in, the signed link is the
 * key. A link that was altered or is older than 7 days is "not found".
 */
@Public()
@Controller()
export class TrackController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  @TsRestHandler(apiContract.track.read)
  read() {
    return tsRestHandler(apiContract.track.read, async ({ params }) => {
      const view = await readTrack(this.db, this.env, params.token);
      if (!view) return { status: 404, body: { message: 'This link has expired.' } };
      return { status: 200, body: view };
    });
  }
}
