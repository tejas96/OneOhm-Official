import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { ApprovalsInboxService } from './approvals-inbox.service';
import { BusinessSettingsService } from './business-settings.service';
import { JobRunsService } from './job-runs.service';
import { ProjectVariantsService } from './project-variants.service';

@Controller()
export class BusinessSettingsController {
  constructor(
    private readonly settings: BusinessSettingsService,
    private readonly variants: ProjectVariantsService,
    private readonly runs: JobRunsService,
    private readonly inbox: ApprovalsInboxService,
  ) {}

  @TsRestHandler(apiContract.businessSettings)
  handler(@CurrentActor() actor: Actor) {
    const configure = () => assertCan(actor, 'settings.manage');
    return tsRestHandler(apiContract.businessSettings, {
      reminders: async () => {
        configure();
        return { status: 200, body: await this.settings.get('reminders') };
      },
      saveReminders: async ({ body }) => {
        configure();
        return { status: 200, body: await this.settings.save(actor, 'reminders', body) };
      },
      assignment: async () => {
        configure();
        return { status: 200, body: await this.settings.get('assignment') };
      },
      saveAssignment: async ({ body }) => {
        configure();
        return { status: 200, body: await this.settings.save(actor, 'assignment', body) };
      },
      leadAssignment: async () => {
        configure();
        return { status: 200, body: await this.settings.leadAssignment() };
      },
      saveLeadAssignment: async ({ body }) => {
        configure();
        return { status: 200, body: await this.settings.saveLeadAssignment(actor, body) };
      },
      approvals: async () => {
        configure();
        return { status: 200, body: await this.settings.approvals() };
      },
      saveApprovals: async ({ body }) => {
        configure();
        await this.settings.save(actor, 'approvals', body);
        return { status: 200, body: await this.settings.approvals() };
      },
      dashboard: async () => {
        configure();
        return { status: 200, body: await this.settings.get('dashboard') };
      },
      saveDashboard: async ({ body }) => {
        configure();
        return { status: 200, body: await this.settings.save(actor, 'dashboard', body) };
      },
      projectVariants: async () => {
        assertCan(actor, 'settings.manage', 'projects.create');
        return { status: 200, body: await this.variants.list() };
      },
      saveProjectVariant: async ({ params, body }) => {
        configure();
        return { status: 200, body: await this.variants.save(actor, params.key, body) };
      },
      jobRuns: async () => {
        configure();
        return { status: 200, body: await this.runs.list() };
      },
      retryJobRun: async ({ params }) => {
        configure();
        return { status: 202, body: await this.runs.retry(actor, params.id) };
      },
      // Everyone signed in has a list; it holds only what they may decide.
      myApprovals: async () => ({ status: 200, body: await this.inbox.mine(actor) }),
    });
  }
}
