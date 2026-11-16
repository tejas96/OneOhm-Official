import { Controller, Req, StreamableFile } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request } from 'express';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { encodeCsv } from '../business-reports/csv';
import { MonthSheetService } from './month-sheet.service';

/** The month sheet and My month. Who may see whom (and pay) is decided by the service. */
@Controller()
export class MonthSheetController {
  constructor(private readonly sheets: MonthSheetService) {}

  @TsRestHandler(apiContract.monthSheet)
  handler(@CurrentActor() actor: Actor, @Req() request: Request) {
    // Days, leave and pay are personal: never kept by a browser or proxy.
    request.res?.setHeader('Cache-Control', 'private, no-store');
    return tsRestHandler(apiContract.monthSheet, {
      monthSheet: async ({ query }) => ({
        status: 200,
        body: await this.sheets.sheet(actor, query.month),
      }),
      monthSheetExport: async ({ query }) => {
        const table = await this.sheets.csv(actor, query.month);
        const body = Buffer.from(encodeCsv(table), 'utf8');
        const file = new StreamableFile(body, {
          type: 'text/csv; charset=utf-8',
          length: body.length,
          disposition: `attachment; filename="${table.fileName}.csv"`,
        });
        return { status: 200, body: file as unknown as Blob };
      },
      monthSheetPerson: async ({ params, query }) => ({
        status: 200,
        body: await this.sheets.person(actor, params.userId, query.month),
      }),
      lockMonth: async ({ body }) => ({
        status: 200,
        body: await this.sheets.lock(actor, body.month),
      }),
      unlockMonth: async ({ body }) => ({
        status: 200,
        body: await this.sheets.unlock(actor, body.month, body.reason),
      }),
      refreshMonthRow: async ({ params, body }) => ({
        status: 200,
        body: await this.sheets.refresh(actor, body.month, params.userId),
      }),
      myMonth: async ({ query }) => ({
        status: 200,
        body: await this.sheets.mine(actor, query.month),
      }),
    });
  }
}
