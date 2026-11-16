import { Controller, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request } from 'express';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { LiveMapService } from './live-map.service';

/** The manager's live map. Who may see whom is decided by the service (403 for nobody). */
@Controller()
export class LiveMapController {
  constructor(private readonly live: LiveMapService) {}

  @TsRestHandler(apiContract.liveMap)
  handler(@CurrentActor() actor: Actor, @Req() request: Request) {
    // Where people are is personal and changes by the minute: never kept by a browser or proxy.
    request.res?.setHeader('Cache-Control', 'private, no-store');
    return tsRestHandler(apiContract.liveMap, {
      liveTeam: async () => ({ status: 200, body: await this.live.team(actor) }),
      liveSites: async () => ({ status: 200, body: await this.live.sites(actor) }),
    });
  }
}
