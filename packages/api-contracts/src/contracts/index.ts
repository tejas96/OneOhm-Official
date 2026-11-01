import { afterSalesContract, customerAfterSalesContract } from './after-sales.contract';
import { auditContract } from './audit.contract';
import { authContract } from './auth.contract';
import { bankPayoutsContract } from './bank-payouts.contract';
import { billingContract, customerBillingContract } from './billing.contract';
import { businessReportsContract } from './business-reports.contract';
import { businessSettingsContract } from './business-settings.contract';
import { cashHandlingContract } from './cash-handling.contract';
import { catalogContract } from './catalog.contract';
import { commissionsContract } from './commissions.contract';
import { contractorsContract } from './contractors.contract';
import { crmContract } from './crm.contract';
import { customerContract } from './customer.contract';
import { customerContactContract } from './customer-contact.contract';
import { customerFamilyContract } from './customer-family.contract';
import {
  customerAppLanguageContract,
  customerLanguageContract,
} from './customer-language.contract';
import { customerPayContract } from './customer-pay.contract';
import { discomContract } from './discom.contract';
import { changeRequestTypesContract, reportFormatsContract } from './discom-setup.contract';
import { documentBundleContract } from './document-bundle.contract';
import { documentChecklistContract } from './document-checklist.contract';
import {
  customerDocumentRequestsContract,
  documentRequestsContract,
  reportSettingsContract,
} from './document-requests.contract';
import { documentRequirementsContract } from './document-requirements.contract';
import { documentsContract } from './documents.contract';
import { engagementContract } from './engagement.contract';
import { financeContract } from './finance.contract';
import { gatewayCheckContract } from './gateway-check.contract';
import { inventoryContract } from './inventory.contract';
import { leadIntakeContract } from './lead-intake.contract';
import { leadStepsContract } from './lead-steps.contract';
import { listsContract } from './lists.contract';
import { notificationsContract } from './notifications.contract';
import { paymentLinksContract } from './payment-links.contract';
import { paymentPlansContract } from './payment-plans.contract';
import { peopleContract } from './people.contract';
import { productDatasheetContract } from './product-datasheet.contract';
import { projectChangesContract } from './project-changes.contract';
import { projectTeamContract } from './project-team.contract';
import { projectsContract, tasksContract } from './projects.contract';
import { purchasingContract } from './purchasing.contract';
import { quotationsContract } from './quotations.contract';
import { customerReferralsContract, referralsContract } from './referrals.contract';
import { reportsContract } from './reports.contract';
import { rewardsContract } from './rewards.contract';
import { searchContract } from './search.contract';
import { serviceDeskContract } from './service-desk.contract';
import { serviceVisitsContract } from './service-visits.contract';
import { siteActivityContract } from './site-activity.contract';
import { siteConnectionContract } from './site-connection.contract';
import { skillsContract } from './skills.contract';
import { customerStageRatingsContract, stageRatingsContract } from './stage-ratings.contract';
import { stateSupportContract } from './state-support.contract';
import { teamLoadContract } from './team-load.contract';
import { templatesContract } from './templates.contract';
import { whatsappContract } from './whatsapp.contract';
import { workforceContract } from './workforce.contract';

/**
 * The whole public API as module contracts. Each app assembles the router with
 * `initContract().router(apiRouterDefinition, apiContractOptions)`.
 */
export type ApiRouterDefinition = {
  readonly auth: typeof authContract;
  readonly people: typeof peopleContract;
  readonly catalog: typeof catalogContract;
  readonly crm: typeof crmContract;
  readonly customer: typeof customerContract;
  readonly quotations: typeof quotationsContract;
  readonly projects: typeof projectsContract;
  readonly tasks: typeof tasksContract;
  readonly reports: typeof reportsContract;
  readonly documents: typeof documentsContract;
  readonly serviceDesk: typeof serviceDeskContract;
  readonly inventory: typeof inventoryContract;
  readonly finance: typeof financeContract;
  readonly billing: typeof billingContract;
  readonly customerBilling: typeof customerBillingContract;
  readonly customerPay: typeof customerPayContract;
  readonly contractors: typeof contractorsContract;
  readonly discom: typeof discomContract;
  readonly changeRequestTypes: typeof changeRequestTypesContract;
  readonly reportFormats: typeof reportFormatsContract;
  readonly workforce: typeof workforceContract;
  readonly rewards: typeof rewardsContract;
  readonly notifications: typeof notificationsContract;
  readonly paymentLinks: typeof paymentLinksContract;
  readonly whatsapp: typeof whatsappContract;
  readonly templates: typeof templatesContract;
  readonly audit: typeof auditContract;
  readonly paymentPlans: typeof paymentPlansContract;
  readonly afterSales: typeof afterSalesContract;
  readonly customerAfterSales: typeof customerAfterSalesContract;
  readonly referrals: typeof referralsContract;
  readonly customerReferrals: typeof customerReferralsContract;
  readonly commissions: typeof commissionsContract;
  readonly documentChecklist: typeof documentChecklistContract;
  readonly documentBundle: typeof documentBundleContract;
  readonly teamLoad: typeof teamLoadContract;
  readonly businessReports: typeof businessReportsContract;
  readonly documentRequests: typeof documentRequestsContract;
  readonly customerDocumentRequests: typeof customerDocumentRequestsContract;
  readonly reportSettings: typeof reportSettingsContract;
  readonly siteActivity: typeof siteActivityContract;
  readonly siteConnection: typeof siteConnectionContract;
  readonly purchasing: typeof purchasingContract;
  readonly cashHandling: typeof cashHandlingContract;
  readonly skills: typeof skillsContract;
  readonly leadSteps: typeof leadStepsContract;
  readonly documentRequirements: typeof documentRequirementsContract;
  readonly customerFamily: typeof customerFamilyContract;
  readonly customerAppLanguage: typeof customerAppLanguageContract;
  readonly customerLanguage: typeof customerLanguageContract;
  readonly customerContact: typeof customerContactContract;
  readonly bankPayouts: typeof bankPayoutsContract;
  readonly gatewayCheck: typeof gatewayCheckContract;
  readonly stageRatings: typeof stageRatingsContract;
  readonly customerStageRatings: typeof customerStageRatingsContract;
  readonly serviceVisits: typeof serviceVisitsContract;
  readonly leadIntake: typeof leadIntakeContract;
  readonly engagement: typeof engagementContract;
  readonly projectTeam: typeof projectTeamContract;
  readonly productDatasheet: typeof productDatasheetContract;
  readonly lists: typeof listsContract;
  readonly search: typeof searchContract;
  readonly businessSettings: typeof businessSettingsContract;
  readonly projectChanges: typeof projectChangesContract;
  readonly stateSupport: typeof stateSupportContract;
};

export const apiRouterDefinition: ApiRouterDefinition = {
  auth: authContract,
  people: peopleContract,
  catalog: catalogContract,
  crm: crmContract,
  customer: customerContract,
  quotations: quotationsContract,
  projects: projectsContract,
  tasks: tasksContract,
  reports: reportsContract,
  documents: documentsContract,
  serviceDesk: serviceDeskContract,
  inventory: inventoryContract,
  finance: financeContract,
  billing: billingContract,
  customerBilling: customerBillingContract,
  customerPay: customerPayContract,
  contractors: contractorsContract,
  discom: discomContract,
  changeRequestTypes: changeRequestTypesContract,
  reportFormats: reportFormatsContract,
  workforce: workforceContract,
  rewards: rewardsContract,
  notifications: notificationsContract,
  paymentLinks: paymentLinksContract,
  whatsapp: whatsappContract,
  templates: templatesContract,
  audit: auditContract,
  paymentPlans: paymentPlansContract,
  afterSales: afterSalesContract,
  customerAfterSales: customerAfterSalesContract,
  referrals: referralsContract,
  customerReferrals: customerReferralsContract,
  commissions: commissionsContract,
  documentChecklist: documentChecklistContract,
  documentBundle: documentBundleContract,
  teamLoad: teamLoadContract,
  businessReports: businessReportsContract,
  documentRequests: documentRequestsContract,
  customerDocumentRequests: customerDocumentRequestsContract,
  reportSettings: reportSettingsContract,
  siteActivity: siteActivityContract,
  siteConnection: siteConnectionContract,
  purchasing: purchasingContract,
  cashHandling: cashHandlingContract,
  skills: skillsContract,
  leadSteps: leadStepsContract,
  documentRequirements: documentRequirementsContract,
  customerFamily: customerFamilyContract,
  customerAppLanguage: customerAppLanguageContract,
  customerLanguage: customerLanguageContract,
  customerContact: customerContactContract,
  bankPayouts: bankPayoutsContract,
  gatewayCheck: gatewayCheckContract,
  stageRatings: stageRatingsContract,
  customerStageRatings: customerStageRatingsContract,
  serviceVisits: serviceVisitsContract,
  leadIntake: leadIntakeContract,
  engagement: engagementContract,
  projectTeam: projectTeamContract,
  productDatasheet: productDatasheetContract,
  lists: listsContract,
  search: searchContract,
  businessSettings: businessSettingsContract,
  projectChanges: projectChangesContract,
  stateSupport: stateSupportContract,
};

export { type ContractorInput, contractorInputSchema } from './contractors.contract';
export { type PropertyInput, propertyInputSchema } from './crm.contract';
export { type CustomerPayLink, customerPayLinkSchema } from './customer-pay.contract';
export { type ReportSetting, reportSettingSchema } from './document-requests.contract';
export {
  type LeadOwner,
  leadOwnerSchema,
  type PhoneMatch,
  phoneMatchSchema,
  type WebsiteLeadInput,
  websiteLeadInputSchema,
} from './lead-intake.contract';
export {
  REPORT_KEYS,
  type ReportKey,
  type ReportOverview,
  reportKeySchema,
  reportOverviewSchema,
} from './reports.contract';
export {
  authContract,
  billingContract,
  catalogContract,
  contractorsContract,
  crmContract,
  customerBillingContract,
  customerContract,
  discomContract,
  documentsContract,
  financeContract,
  inventoryContract,
  peopleContract,
  projectsContract,
  quotationsContract,
  reportsContract,
  rewardsContract,
  serviceDeskContract,
  tasksContract,
  workforceContract,
};
