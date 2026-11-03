import type { ProjectDetail } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, type OutboxRow, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { type Sale, sellProject } from '../support/sales';
import {
  completeThrough,
  project,
  sessionOf,
  surveyFacts,
  taskByKey,
  workTask,
} from '../support/tasks';

// PRD 13 "Task communication": a configured task sends the correct WhatsApp message when
// its trigger is reached. WhatsApp runs in log mode, so the proof is the outbox row the
// worker would send: template key, recipient and the words it fills in.
interface Template {
  key: string;
  title: string;
  notifyCustomer: boolean;
  notifyEvent: 'started' | 'completed' | 'approved';
  messageKey: string | null;
  customerTitle: string | null;
}

describe('Task communication', () => {
  let admin: Session;
  let sale: Sale;
  let templates: Map<string, Template>;
  // Templates name the project by its town, not its code (live QA C9); these messages
  // carry the size already, so the town alone.
  let projectWords: string;
  const forTask = (rows: OutboxRow[], event: string, taskId: string) =>
    rows.filter((row) => row.dedupe_key === `task_${event}:${taskId}`);

  beforeAll(async () => {
    admin = await Session.admin();
    const list = await admin.get<Template[]>('/settings/task-templates');
    templates = new Map(list.map((template) => [template.key, template]));
    sale = await sellProject(admin, { name: 'Message Customer (test)' });
    const [site] = await rows<{ city: string }>(
      'select pr.city from projects p join properties pr on pr.id = p.property_id where p.id = $1',
      [sale.project.id],
    );
    projectWords = site?.city ?? '';
  });
  afterAll(closeDb);

  it('has messages configured on customer steps and none on internal ones', async () => {
    expect(templates.get('site_survey')?.notifyCustomer).toBe(true);
    expect(templates.get('structure_installation')?.notifyEvent).toBe('started');
    expect(templates.get('testing_commissioning')?.messageKey).toBe('commissioning_completed');
    expect(templates.get('electricity_details')?.notifyCustomer).toBe(false);
    const messages = await admin.get<{ key: string }[] | { templates: { key: string }[] }>(
      '/settings/message-templates',
    );
    const keys = (Array.isArray(messages) ? messages : messages.templates).map((row) => row.key);
    for (const key of ['project_milestone', 'installation_started', 'commissioning_completed'])
      expect(keys).toContain(key);
  });

  it('sends nothing when an internal task is done', async () => {
    const detail = await project(admin, sale.project.id);
    const task = taskByKey(detail, 'electricity_details');
    const done = await workTask(admin, task);
    expect(done.status).toBe('completed');
    expect(forTask(await outboxFor(sale.customer.phone), 'completed', task.id)).toHaveLength(0);
  });

  it('queues the milestone message once the survey is approved, not while in review', async () => {
    const detail = await project(admin, sale.project.id);
    const survey = taskByKey(detail, 'site_survey');
    const facts = await surveyFacts(admin, detail, survey);
    const inReview = await workTask(admin, survey, { facts, approve: false });
    expect(inReview.status).toBe('in_review');
    expect(forTask(await outboxFor(sale.customer.phone), 'completed', survey.id)).toHaveLength(0);

    await admin.post(`/tasks/${survey.id}/approve`);
    const [row] = forTask(await outboxFor(sale.customer.phone), 'completed', survey.id);
    expect(row?.channel).toBe('whatsapp');
    expect(row?.template).toBe('project_milestone');
    expect(row?.recipient).toBe(sale.customer.phone);
    expect(row?.payload.project).toBe(projectWords);
    expect(row?.payload.step).toBe('site_survey');
    expect(row?.payload.customer).toBe(sale.customer.name);
    const survTemplate = templates.get('site_survey');
    expect(row?.payload.milestone).toBe(survTemplate?.customerTitle?.trim() || survey.title);
  });

  it('tells the customer when installation starts (a "started" trigger)', async () => {
    await completeThrough(admin, sale.project.id, 'dispatch_material');
    const structure = taskByKey(await project(admin, sale.project.id), 'structure_installation');
    const crew = await sessionOf(admin, structure.assignee?.id ?? '');
    await crew.post(`/tasks/${structure.id}/start`);
    const [row] = forTask(await outboxFor(sale.customer.phone), 'started', structure.id);
    expect(row?.template).toBe('installation_started');
    expect(row?.payload.project).toBe(projectWords);
    // Starting again after a pause does not message twice.
    await crew.post(`/tasks/${structure.id}/waiting`, {
      party: 'customer',
      note: 'Gate locked (test)',
    });
    await crew.post(`/tasks/${structure.id}/start`);
    expect(forTask(await outboxFor(sale.customer.phone), 'started', structure.id)).toHaveLength(1);
    const again = taskByKey(await project(admin, sale.project.id), 'structure_installation');
    expect((await workTask(admin, again, { as: crew })).status).toBe('completed');
  });

  it('sends the commissioning message with its own template', async () => {
    const done = await completeThrough(admin, sale.project.id, 'testing_commissioning');
    expect(done.status).toBe('completed');
    const [row] = forTask(await outboxFor(sale.customer.phone), 'completed', done.id);
    expect(row?.template).toBe('commissioning_completed');
    expect(row?.payload.project).toBe(projectWords);
  });

  it('messages exactly the configured steps among everything finished so far', async () => {
    const detail: ProjectDetail = await project(admin, sale.project.id);
    const outbox = await outboxFor(sale.customer.phone);
    const finished = detail.tasks.filter((task) => task.status === 'completed');
    expect(finished.length).toBeGreaterThan(8);
    for (const task of finished) {
      const template = templates.get(task.templateKey);
      const expected = template?.notifyCustomer ? 1 : 0;
      const sent = forTask(outbox, template?.notifyEvent ?? 'completed', task.id).length;
      expect({ task: task.templateKey, sent }).toEqual({ task: task.templateKey, sent: expected });
    }
  });
});
