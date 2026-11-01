import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { pdfBody } from '../reports/reports.controller';
import { ContractorCrewService } from './contractor-crew.service';
import { ContractorsService } from './contractors.service';
import { WorkOrderAdjustmentsService } from './work-order-adjustments.service';
import { WorkOrderPdfService } from './work-order-pdf.service';
import { WorkOrdersService } from './work-orders.service';

@Controller()
export class ContractorsController {
  constructor(
    private readonly contractors: ContractorsService,
    private readonly crew: ContractorCrewService,
    private readonly workOrders: WorkOrdersService,
    private readonly adjustments: WorkOrderAdjustmentsService,
    private readonly pdf: WorkOrderPdfService,
  ) {}

  @TsRestHandler(apiContract.contractors)
  handler(@CurrentActor() actor: Actor) {
    const manage = () => assertCan(actor, 'contractors.manage');
    return tsRestHandler(apiContract.contractors, {
      listContractors: async ({ query }) => {
        manage();
        return { status: 200, body: await this.contractors.list(query.search) };
      },
      createContractor: async ({ body }) => {
        manage();
        return { status: 201, body: await this.contractors.create(actor, body) };
      },
      getContractor: async ({ params }) => {
        manage();
        return { status: 200, body: await this.contractors.get(params.id) };
      },
      updateContractor: async ({ params, body }) => {
        manage();
        return { status: 200, body: await this.contractors.update(actor, params.id, body) };
      },
      crewCandidates: async () => {
        manage();
        return { status: 200, body: await this.crew.crewCandidates() };
      },
      setContractorMembers: async ({ params, body }) => {
        manage();
        return {
          status: 200,
          body: await this.crew.setMembers(actor, params.id, body.members),
        };
      },
      addContractorRate: async ({ params, body }) => {
        manage();
        return { status: 201, body: await this.crew.addRate(actor, params.id, body) };
      },
      updateContractorRate: async ({ params, body }) => {
        manage();
        return { status: 200, body: await this.crew.updateRate(actor, params.id, body) };
      },
      issueWorkOrder: async ({ params, body }) => {
        manage();
        assertCan(actor, 'tasks.assign');
        return { status: 201, body: await this.workOrders.issue(actor, params.id, body) };
      },
      listWorkOrders: async ({ query }) => ({
        status: 200,
        body: await this.workOrders.list(actor, query),
      }),
      getWorkOrder: async ({ params }) => ({
        status: 200,
        body: await this.workOrders.get(actor, params.id),
      }),
      // Same access as viewing the order: managers, or the contractor's own crew.
      workOrderPdf: async ({ params, query }) => {
        const order = await this.workOrders.get(actor, params.id);
        return { status: 200, body: pdfBody(await this.pdf.render(order), query.disposition) };
      },
      addWorkOrderLine: async ({ params, body }) => {
        manage();
        return { status: 201, body: await this.adjustments.addLine(actor, params.id, body) };
      },
      recordRework: async ({ params, body }) => {
        manage();
        return { status: 201, body: await this.adjustments.rework(actor, params.id, body) };
      },
      recordAdvance: async ({ params, body }) => {
        manage();
        return { status: 201, body: await this.adjustments.advance(actor, params.id, body) };
      },
      cancelWorkOrder: async ({ params, body }) => {
        manage();
        return { status: 200, body: await this.workOrders.cancel(actor, params.id, body.reason) };
      },
    });
  }
}
