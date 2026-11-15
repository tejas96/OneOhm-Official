import { Controller, Get, Inject, Logger, Param, Query, Res } from '@nestjs/common';
import { errorDetail, PlatformError, plainError } from '@oneohm/marketing';
import type { Response } from 'express';
import { Public } from '../../../common/auth/auth.decorators';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { MARKETING_CONFIG, type MarketingConfig } from '../marketing-config.provider';
import { completeSignIn, type FlowDeps, saveFailure } from './connect-flow';
import { verifyState } from './connection-state';
import { connectionsUrl } from './connection-words';

const NOT_FINISHED = 'You did not finish connecting. Try again when ready.';
const BAD_STATE = 'That sign-in link has expired. Open Connect again.';

/**
 * Where Meta and Google send the person back after sign-in. No session here: the signed `state`
 * we gave at the start says who began it. Every outcome redirects to Marketing → Connections.
 */
@Public()
@Controller('v1/marketing/connect')
export class ConnectCallbackController {
  private readonly log = new Logger('MarketingConnect');
  private readonly deps: FlowDeps;

  constructor(
    @Inject(DATABASE) db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    @Inject(MARKETING_CONFIG) config: MarketingConfig,
  ) {
    this.deps = { db, env, config };
  }

  @Get(':provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query() query: Record<string, string | undefined>,
    @Res() res: Response,
  ): Promise<void> {
    const go = (result: { connected: string } | { error: string }) =>
      res.redirect(connectionsUrl(this.env.WEB_BASE_URL, result));
    const state = verifyState(this.deps.config.secretKey, query.state);
    if (!state || state.provider !== provider) return go({ error: BAD_STATE });
    if (query.error || !query.code) return go({ error: NOT_FINISHED });
    try {
      await completeSignIn(this.deps, state.provider, state.userId, query.code);
      return go({ connected: state.provider });
    } catch (error) {
      this.log.warn(errorDetail(error));
      const words = plainError(error);
      if (error instanceof PlatformError)
        await saveFailure(this.deps, state.provider, words).catch((saveError) =>
          this.log.warn(errorDetail(saveError)),
        );
      return go({ error: words });
    }
  }
}
