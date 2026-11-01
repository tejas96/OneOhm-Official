import type { Company } from '@oneohm/api-contracts';
import { formatPhone } from './quotation-document';
import { indianDate } from './report-handlebars';
import type { ReportProject } from './report-status.service';

const SITE_CATEGORY = {
  residential: 'Residential',
  society: 'Residential (housing society)',
  commercial: 'Commercial',
} as const;

/**
 * The values a statutory template reads: the project's captured facts, the company's
 * details as the vendor, and a few values that follow from the project itself. A fact
 * captured by a task always wins over a derived value.
 */
export function reportValues(
  project: ReportProject,
  company: Company,
  today: string,
): Record<string, string> {
  const facts = project.facts;
  const installed = facts.installed_capacity_kw ?? '';
  const derived: Record<string, string> = {
    site_category: SITE_CATEGORY[project.type],
    inverter_make_model: facts.inverter_make ?? '',
    earthing_details: facts.earthing_resistance
      ? `Earth resistance ${facts.earthing_resistance} Ω`
      : '',
    // MSEDCL rooftop application fields that follow from how OneOhm builds systems:
    // grid-connected solar under net metering, owned by the customer (CAPEX).
    re_source: 'Solar',
    re_arrangement_type: 'Net Metering',
    project_model: 'CAPEX',
    capacity_type: project.groundMount ? 'Ground mounted' : 'Rooftop',
    re_installed_capacity_rooftop_kw: project.groundMount ? '0' : installed,
    re_installed_capacity_ground_kw: project.groundMount ? installed : '0',
    re_installed_capacity_rooftop_ground_kw: installed,
  };
  return {
    ...derived,
    ...facts,
    ...(facts.consumer_phone ? { consumer_phone: formatPhone(facts.consumer_phone) } : {}),
    vendor_name: company.legalName,
    vendor_address: company.fullAddress,
    signatory_name: company.signatoryName,
    signatory_designation: company.signatoryDesignation,
    signatory_phone: company.signatoryPhone,
    signatory_email: company.signatoryEmail,
    generated_on: indianDate(today),
  };
}
