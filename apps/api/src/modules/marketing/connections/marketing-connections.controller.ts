import { Controller, Inject, Logger } from '@nestjs/common';
import {
  errorDetail,
  googleLoginUrl,
  metaLoginUrl,
  PlatformError,
  sandboxConnect,
} from '@oneohm/marketing';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../../common/auth/actor';
import { CurrentActor } from '../../../common/auth/auth.decorators';
import { invalid } from '../../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { apiContract } from '../../../contract';
import { MARKETING_CONFIG, type MarketingConfig } from '../marketing-config.provider';
import { callbackUrl, chooseAccount, disconnect, type FlowDeps } from './connect-flow';
import { signState } from './connection-state';
import { connectionsUrl, missingSettingsWords } from './connection-words';
import { buildConnections } from './connections-summary';
import { saveMarketingSettings, searchPlaces } from './place-settings';
import { submitMarketingTemplate } from './template-submit';

const route = apiContract.marketing;

/**
 * Marketing → Connections: Meta and Google sign-in, the WhatsApp marketing messages and the
 * defaults. Every route needs `marketing.manage`. One handler per route, because the campaigns
 * controller serves the other routes of the same contract.
 */
@Controller()
export class MarketingConnectionsController {
  private readonly log = new Logger('MarketingConnections');
  private readonly deps: FlowDeps;

  constructor(
    @Inject(DATABASE) db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    @Inject(MARKETING_CONFIG) private readonly config: MarketingConfig,
  ) {
    this.deps = { db, env, config };
  }

  /** A platform's refusal goes to the screen in plain words; the detail goes to the log. */
  private async plain<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (!(error instanceof PlatformError)) throw error;
      this.log.warn(errorDetail(error));
      throw invalid(error.message);
    }
  }

  @TsRestHandler(route.connections)
  connections(@CurrentActor() actor: Actor) {
    return tsRestHandler(route.connections, async () => {
      assertCan(actor, 'marketing.manage');
      return { status: 200, body: await buildConnections(this.deps) };
    });
  }

  @TsRestHandler(route.connectStart)
  start(@CurrentActor() actor: Actor) {
    return tsRestHandler(route.connectStart, async ({ params }) => {
      assertCan(actor, 'marketing.manage');
      const { provider } = params;
      const { config, env } = this;
      if (config.mode === 'sandbox') {
        await sandboxConnect(this.deps.db, config.secretKey, provider, actor.userId);
        return {
          status: 200,
          body: { url: connectionsUrl(env.WEB_BASE_URL, { connected: provider }) },
        };
      }
      const app = provider === 'meta' ? config.meta : config.google;
      if (!app) throw invalid(missingSettingsWords(config.missing[provider]));
      const login = {
        redirectUri: callbackUrl(env, provider),
        state: signState(config.secretKey, { provider, userId: actor.userId }),
      };
      const url =
        provider === 'meta' && config.meta
          ? metaLoginUrl(config.meta, login)
          : config.google
            ? googleLoginUrl(config.google, login)
            : '';
      return { status: 200, body: { url } };
    });
  }

  @TsRestHandler(route.choose)
  choose(@CurrentActor() actor: Actor) {
    return tsRestHandler(route.choose, async ({ params, body }) => {
      assertCan(actor, 'marketing.manage');
      await this.plain(() => chooseAccount(this.deps, params.provider, actor.userId, body));
      return { status: 200, body: await buildConnections(this.deps) };
    });
  }

  @TsRestHandler(route.disconnect)
  disconnect(@CurrentActor() actor: Actor) {
    return tsRestHandler(route.disconnect, async ({ params }) => {
      assertCan(actor, 'marketing.manage');
      await disconnect(this.deps, params.provider, actor.userId);
      return { status: 200, body: await buildConnections(this.deps) };
    });
  }

  @TsRestHandler(route.saveSettings)
  settings(@CurrentActor() actor: Actor) {
    return tsRestHandler(route.saveSettings, async ({ body }) => {
      assertCan(actor, 'marketing.manage');
      await saveMarketingSettings(this.deps, actor.userId, body);
      return { status: 200, body: await buildConnections(this.deps) };
    });
  }

  @TsRestHandler(route.findPlace)
  place(@CurrentActor() actor: Actor) {
    return tsRestHandler(route.findPlace, async ({ query }) => {
      assertCan(actor, 'marketing.manage');
      return { status: 200, body: await searchPlaces(this.deps, query.q) };
    });
  }

  @TsRestHandler(route.submitTemplate)
  template(@CurrentActor() actor: Actor) {
    return tsRestHandler(route.submitTemplate, async ({ params }) => {
      assertCan(actor, 'marketing.manage');
      await submitMarketingTemplate(this.deps, params.key);
      return { status: 200, body: await buildConnections(this.deps) };
    });
  }
}
