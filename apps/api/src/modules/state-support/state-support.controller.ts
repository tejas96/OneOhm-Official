import { Controller, Inject } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { DATABASE, type Database } from '../../config/core.module';
import { apiContract } from '../../contract';
import { setLowIncome } from './low-income';
import { StateRulesService } from './state-rules.service';

@Controller()
export class StateSupportController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly rules: StateRulesService,
  ) {}

  @TsRestHandler(apiContract.stateSupport)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.stateSupport, {
      listStateRules: async () => ({ status: 200, body: await this.rules.list() }),
      createStateRule: async ({ body }) => {
        assertCan(actor, 'subsidy.manage');
        return { status: 201, body: await this.rules.create(actor, body) };
      },
      updateStateRule: async ({ params, body }) => {
        assertCan(actor, 'subsidy.manage');
        return { status: 200, body: await this.rules.update(actor, params.id, body) };
      },
      deleteStateRule: async ({ params }) => {
        assertCan(actor, 'subsidy.manage');
        await this.rules.remove(actor, params.id);
        return { status: 204, body: undefined };
      },
      setLowIncome: async ({ params, body }) => {
        assertCan(actor, 'subsidy.manage', 'customers.manage');
        return {
          status: 200,
          body: await setLowIncome(this.db, actor, params.id, body.lowIncome),
        };
      },
    });
  }
}
