import commandCenter from './command-center.json';
import common from './common.json';
import contractors from './contractors.json';
import customers from './customers.json';
import discom from './discom.json';
import documents from './documents.json';
import finance from './finance.json';
import inventory from './inventory.json';
import leads from './leads.json';
import projects from './projects.json';
import quotations from './quotations.json';
import reports from './reports.json';
import service from './service.json';
import settings from './settings.json';
import signIn from './sign-in.json';
import team from './team.json';
import today from './today.json';

/**
 * English (India) messages, one file per feature so screens can grow independently.
 * Add a feature's file here; keys must not clash between files.
 */
const messages = {
  ...common,
  ...signIn,
  ...commandCenter,
  ...contractors,
  ...customers,
  ...documents,
  ...inventory,
  ...finance,
  ...discom,
  ...leads,
  ...projects,
  ...quotations,
  ...reports,
  ...service,
  ...settings,
  ...team,
  ...today,
};
export default messages;
