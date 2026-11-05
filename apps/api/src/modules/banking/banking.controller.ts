import { Controller } from '@nestjs/common';
import { isValidIfsc } from '@oneohm/domain';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { AppError, invalid } from '../../common/http/errors';
import { apiContract } from '../../contract';
import { createIfscLookup } from './ifsc-lookup';

const lookup = createIfscLookup();

/** Bank helpers for the forms where bank details are typed in. */
@Controller()
export class BankingController {
  @TsRestHandler(apiContract.banking)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.banking, {
      ifsc: async ({ params }) => {
        assertCan(
          actor,
          'procurement.manage',
          'contractors.manage',
          'finance.record_payments',
          'finance.approve_payments',
        );
        if (!isValidIfsc(params.code)) throw invalid('Enter a valid IFSC.');
        const answer = await lookup(params.code);
        if (answer.available && !answer.branch) {
          throw new AppError(404, 'No bank branch has this IFSC.', 'ifsc_not_found');
        }
        return { status: 200, body: answer };
      },
    });
  }
}
