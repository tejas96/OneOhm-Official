import afterSales from './after-sales.json';
import alerts from './alerts.json';
import businessReports from './business-reports.json';
import commandCenter from './command-center.json';
import common from './common.json';
import contractors from './contractors.json';
import costing from './costing.json';
import customerLanguage from './customer-language.json';
import customers from './customers.json';
import discom from './discom.json';
import discomSetup from './discom-setup.json';
import documents from './documents.json';
import finance from './finance.json';
import inventory from './inventory.json';
import leads from './leads.json';
import lists from './lists.json';
import projectTeam from './project-team.json';
import projects from './projects.json';
import purchasing from './purchasing.json';
import quotations from './quotations.json';
import reportCollections from './report-collections.json';
import reportDelays from './report-delays.json';
import reportDelivery from './report-delivery.json';
import reportProfitability from './report-profitability.json';
import reportSales from './report-sales.json';
import reportService from './report-service.json';
import reportTeam from './report-team.json';
import reports from './reports.json';
import rewards from './rewards.json';
import scopeChanges from './scope-changes.json';
import service from './service.json';
import settings from './settings.json';
import signIn from './sign-in.json';
import siteActivity from './site-activity.json';
import team from './team.json';
import today from './today.json';

/**
 * English (India) messages, one file per feature so screens can grow independently.
 * Add a feature's file here; keys must not clash between files.
 */
const messages = {
  ...common,
  ...alerts,
  ...afterSales,
  ...signIn,
  ...commandCenter,
  ...contractors,
  ...costing,
  ...customers,
  ...customerLanguage,
  ...documents,
  ...inventory,
  ...finance,
  ...discom,
  ...discomSetup,
  ...leads,
  ...lists,
  ...projects,
  ...projectTeam,
  ...purchasing,
  ...quotations,
  ...reports,
  ...rewards,
  ...businessReports,
  ...reportSales,
  ...reportDelivery,
  ...reportDelays,
  ...reportCollections,
  ...reportProfitability,
  ...reportTeam,
  ...reportService,
  ...service,
  ...scopeChanges,
  ...settings,
  ...siteActivity,
  ...team,
  ...today,
};
export default messages;
