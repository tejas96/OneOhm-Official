import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { ReportSettingsService } from './report-settings.service';

@Controller()
export class ReportSettingsController {
  constructor(private readonly settings: ReportSettingsService) {}

  @TsRestHandler(apiContract.reportSettings)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.reportSettings, {
      listReportSettings: async () => {
        assertCan(actor, 'documents.view');
        return { status: 200, body: await this.settings.list() };
      },
      updateReportSetting: async ({ params, body }) => ({
        status: 200,
        body: await this.settings.update(actor, params.key, body),
      }),
    });
  }
}
