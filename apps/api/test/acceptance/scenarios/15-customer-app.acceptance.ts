import type { CustomerDocument, CustomerHome, CustomerProject } from '@oneohm/api-contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { upload } from '../support/files';
import { Session } from '../support/http';
import { type Sale, sellProject } from '../support/sales';
import { completeThrough, project } from '../support/tasks';

// PRD 13 "Customer app": the customer tracks progress and subsidy status, pays, accesses
// documents and requests service — and sees nothing of another customer's home.
describe('Customer app', () => {
  let admin: Session;
  let sale: Sale;
  let other: Sale;
  let customer: Session;
  let outsider: Session;
  let warrantyId = '';
  let internalIds: string[] = [];

  const home = async (who: Session = customer) => who.get<CustomerHome>('/customer/home');
  const mine = async (): Promise<CustomerProject> => {
    const found = (await home()).projects.find((row) => row.id === sale.project.id);
    if (!found) throw new Error(`${sale.project.code} is missing from the customer's home.`);
    return found;
  };
  const doneStages = (row: CustomerProject) => row.stages.filter((s) => s.state === 'done').length;
  const doneUpdates = (row: CustomerProject) => row.updates.filter((u) => u.done).length;

  beforeAll(async () => {
    admin = await Session.admin();
    sale = await sellProject(admin, { name: 'Customer App Owner (test)' });
    other = await sellProject(admin, { name: 'Customer App Neighbour (test)' });
    customer = await Session.code(sale.customer.phone, 'customer');
    outsider = await Session.code(other.customer.phone, 'customer');
  });

  it('shows the project, its journey and the subsidy status after signing in by code', async () => {
    const view = await home();
    expect(view.customer.phone).toBe(sale.customer.phone);
    expect(view.projects.map((row) => row.id)).toEqual([sale.project.id]);
    const row = await mine();
    expect(row.code).toBe(sale.project.code);
    expect(row.status).toBe('active');
    expect(row.stages.length).toBeGreaterThan(3);
    expect(row.subsidy.status).toBe('pending');
    expect(row.subsidy.amountPaise).toBe(sale.quotation.totals.subsidyPaise);
    expect(row.payments.totalPaise).toBeGreaterThan(0);
  });

  it('moves the progress the customer sees as the team finishes work', async () => {
    const before = await mine();
    await completeThrough(admin, sale.project.id, 'system_design');
    const after = await mine();
    expect(doneStages(after) + doneUpdates(after)).toBeGreaterThan(
      doneStages(before) + doneUpdates(before),
    );
  });

  it('pays a due milestone online through the sandbox gateway and sees it paid', async () => {
    const due = (await mine()).payments.milestones.find(
      (line) => line.payer === 'customer' && line.status === 'due' && line.id,
    );
    expect(due, 'a customer milestone due now').toBeDefined();
    const link = await customer.post<{ url: string; amountPaise: number; sandbox: boolean }>(
      `/customer/milestones/${due?.id}/pay`,
    );
    expect(link.sandbox).toBe(true);
    expect(link.amountPaise).toBe((due?.amountPaise ?? 0) - (due?.paidPaise ?? 0));
    const page = await fetch(link.url, { method: 'POST' });
    expect(page.status).toBeLessThan(300);

    const paid = (await mine()).payments.milestones.find((line) => line.id === due?.id);
    expect(paid?.status).toBe('paid');
    expect((await mine()).payments.paidPaise).toBeGreaterThanOrEqual(link.amountPaise);
    const staffView = await project(admin, sale.project.id);
    expect(staffView.payments.some((payment) => payment.method === 'razorpay')).toBe(true);
  });

  it('opens customer-facing documents but never internal evidence or team papers', async () => {
    const detail = await project(admin, sale.project.id);
    const warranty = await upload(admin, 'document', {
      projectId: detail.id,
      category: 'warranty',
      name: 'Inverter warranty card (test)',
    });
    warrantyId = warranty.id;
    const contractorPaper = await upload(admin, 'document', {
      projectId: detail.id,
      category: 'contractor',
      name: 'Crew rate sheet (test)',
    });
    const hiddenTask = detail.tasks.find((task) => !task.customerVisible);
    if (!hiddenTask) throw new Error('Every task is customer-visible; nothing internal to check.');
    const workingPhoto = await upload(admin, 'photo', {
      taskId: hiddenTask.id,
      name: 'Working photo (test)',
    });
    internalIds = [contractorPaper.id, workingPhoto.id];

    const list = await customer.get<CustomerDocument[]>('/customer/documents');
    const ids = list.map((doc) => doc.id);
    expect(ids).toContain(warrantyId);
    for (const id of internalIds) expect(ids).not.toContain(id);
    expect(list.some((doc) => doc.category === 'contractor' || doc.category === 'vendor')).toBe(
      false,
    );

    const file = await customer.download(`/customer/documents/${warrantyId}/file`);
    expect(file.status).toBe(200);
    expect(file.bytes.subarray(0, 4).toString()).toBe('%PDF');
    for (const id of internalIds) {
      expect((await customer.download(`/customer/documents/${id}/file`)).status).toBe(404);
    }
    const quote = await customer.download(`/customer/quotations/${sale.quotation.id}/pdf`);
    expect(quote.status).toBe(200);
    expect(quote.type).toContain('application/pdf');
  });

  it('raises a service request that the service desk sees at once', async () => {
    const request = await customer.post<{ id: string; status: string }>(
      '/customer/service-requests',
      {
        projectId: sale.project.id,
        category: 'low_generation',
        description: 'Generation looks low since Monday (test).',
      },
    );
    const own = await customer.get<{ id: string }[]>('/customer/service-requests');
    expect(own.map((row) => row.id)).toContain(request.id);
    const desk = await admin.get<{ id: string; customer: { id: string } }[]>('/service-requests');
    const ticket = desk.find((row) => row.id === request.id);
    expect(ticket?.customer.id).toBe(sale.customer.customerId);
  });

  it('follows the subsidy from pending to applied once the system is running', async () => {
    await completeThrough(admin, sale.project.id, 'subsidy_application');
    const row = await mine();
    expect(row.status).toBe('operational');
    expect(row.subsidy.status).toBe('applied');
  });

  it("keeps another customer's home, money and papers out of reach", async () => {
    const theirs = await home(outsider);
    expect(theirs.projects.map((row) => row.id)).toEqual([other.project.id]);
    const milestone = (await mine()).payments.milestones.find((line) => line.id);
    const pay = await outsider.raw('POST', `/customer/milestones/${milestone?.id}/pay`);
    expect([403, 404]).toContain(pay.status);
    const doc = await outsider.download(`/customer/documents/${warrantyId}/file`);
    expect([403, 404]).toContain(doc.status);
    const quote = await outsider.download(`/customer/quotations/${sale.quotation.id}/pdf`);
    expect([403, 404]).toContain(quote.status);
    const listed = await outsider.get<CustomerDocument[]>('/customer/documents');
    expect(listed.map((row) => row.id)).not.toContain(warrantyId);
    const request = await outsider.raw('POST', '/customer/service-requests', {
      projectId: sale.project.id,
      category: 'low_generation',
      description: 'Not my project (test).',
    });
    expect([400, 403, 404, 422]).toContain(request.status);
    // Staff routes are closed to customers.
    expect([401, 403]).toContain((await customer.raw('GET', '/projects')).status);
  });
});
