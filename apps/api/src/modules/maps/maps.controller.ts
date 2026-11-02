import { Controller, Inject } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { forbidden } from '../../common/http/errors';
import { ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { apiContract } from '../../contract';

/** The browser key: its own key first, then the shared one, else none. */
export function browserKeyFrom(
  env: Pick<Environment, 'GOOGLE_MAPS_BROWSER_KEY' | 'GOOGLE_MAPS_API_KEY'>,
): string | null {
  return env.GOOGLE_MAPS_BROWSER_KEY ?? env.GOOGLE_MAPS_API_KEY ?? null;
}

/** Map settings for signed-in staff. Customers and partners get nothing. */
@Controller()
export class MapsController {
  constructor(@Inject(ENVIRONMENT) private readonly env: Environment) {}

  @TsRestHandler(apiContract.maps)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.maps, {
      config: async () => {
        if (actor.kind !== 'staff') throw forbidden();
        return { status: 200, body: { browserKey: browserKeyFrom(this.env) } };
      },
    });
  }
}
