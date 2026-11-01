import { Inject, Injectable } from '@nestjs/common';
import type { WorkOrderDetail } from '@oneohm/api-contracts';
import {
  contractorMembers,
  contractors,
  customers,
  projects,
  properties,
  users,
} from '@oneohm/database';
import { formatInr, formatKwp } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { CatalogService } from '../catalog/catalog.service';
import { PdfRendererService } from '../reports/pdf-renderer.service';
import { assetText, brandFontCss, logoDataUri, stampDataUri } from '../reports/report-assets';
import { engine } from '../reports/report-handlebars';
import type { PdfFile } from '../reports/report-pdf.service';

const STATUS_LABEL: Record<WorkOrderDetail['tasks'][number]['status'], string> = {
  pending: 'Not started',
  ready: 'Ready',
  in_progress: 'In progress',
  waiting: 'Waiting',
  in_review: 'Waiting for approval',
  completed: 'Done',
};

const longDate = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});
const dayOf = (date: string) => longDate.format(new Date(`${date}T12:00:00+05:30`));
const quantity = (milli: number) => (milli / 1000).toLocaleString('en-IN');
/** "+919876543210" → "+91 98765 43210"; anything else as stored. */
const phone = (e164: string | null) => e164?.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2') ?? null;

let compiled: ReturnType<typeof engine.compile> | null = null;

/**
 * The work order a crew carries to site (PRD 3.13): site, tasks and the agreed rates.
 * It never shows the project's price, margin or other contractors.
 */
@Injectable()
export class WorkOrderPdfService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly catalog: CatalogService,
    private readonly renderer: PdfRendererService,
  ) {}

  async render(order: WorkOrderDetail): Promise<PdfFile> {
    const [row] = await this.db
      .select({
        capacityWp: projects.capacityWp,
        customer: customers.name,
        customerPhone: customers.phoneE164,
        property: properties,
        contractorPhone: contractors.phoneE164,
        terms: contractors.paymentTermsDays,
      })
      .from(projects)
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .innerJoin(properties, eq(properties.id, projects.propertyId))
      .innerJoin(contractors, eq(contractors.id, order.contractor.id))
      .where(eq(projects.id, order.project.id))
      .limit(1);
    if (!row) throw notFound('That work order');
    const [lead] = await this.db
      .select({ name: users.fullName, phone: users.phoneE164 })
      .from(contractorMembers)
      .innerJoin(users, eq(users.id, contractorMembers.userId))
      .where(
        and(
          eq(contractorMembers.contractorId, order.contractor.id),
          eq(contractorMembers.lead, true),
        ),
      )
      .limit(1);
    const company = await this.catalog.company();
    const view = {
      number: order.number,
      issued: longDate.format(new Date(order.createdAt)),
      due: order.dueDate ? dayOf(order.dueDate) : null,
      cancelled:
        order.status === 'cancelled'
          ? `Cancelled${order.cancelledReason ? `: ${order.cancelledReason}` : ''}.`
          : null,
      company: {
        name: company.legalName,
        brand: company.brandName,
        address: company.fullAddress,
        gstin: company.gstin,
        email: company.email,
        phones: company.phones.join(' · '),
        signatory: company.signatoryName,
        designation: company.signatoryDesignation,
      },
      project: { code: order.project.code },
      contractor: {
        name: order.contractor.name,
        lead: lead?.name ?? null,
        phone: phone(lead?.phone ?? row.contractorPhone),
      },
      site: {
        customer: row.customer,
        phone: phone(row.customerPhone),
        address: [row.property.addressLine, row.property.city, row.property.district]
          .filter((part) => part && part.trim() !== '')
          .join(', '),
        system: `${formatKwp(row.capacityWp)} solar system`,
      },
      scope: order.scope,
      tasks: order.tasks.map((task) => ({
        title: task.title,
        due: dayOf(task.dueDate),
        status: STATUS_LABEL[task.status],
      })),
      lines: order.lines.map((line) => ({
        description: line.description,
        quantity: quantity(line.quantityMilli),
        rate: formatInr(line.unitRatePaise),
        amount: formatInr(line.amountPaise),
      })),
      gross: formatInr(order.lines.reduce((sum, line) => sum + line.amountPaise, 0)),
      terms: `Paid within ${row.terms} days of approval`,
      logo: logoDataUri(),
      stamp: stampDataUri(),
    };
    compiled ??= engine.compile(assetText('work-order', 'work-order.hbs'));
    const style = `<style>${brandFontCss()}\n${assetText('quotation', 'quotation.css')}\n${assetText('work-order', 'work-order.css')}</style>`;
    const html = compiled(view).replace('</head>', `${style}</head>`);
    const content = await this.renderer.render(html, {
      footer: `${company.legalName} · Work order ${order.number}`,
    });
    return { fileName: `${order.number.replaceAll('/', '-')}.pdf`, content };
  }
}
