import { describe, expect, it } from 'vitest';
import {
  type ReportTriggerTask,
  reportRequirements,
  reportWaitsFor,
  taskDateFacts,
  unknownReportNames,
} from './report-fields';

const task = (patch: Partial<ReportTriggerTask>): ReportTriggerTask => ({
  templateKey: 'installation_complete',
  title: 'Installation check and sign-off',
  status: 'ready',
  reports: ['wcr'],
  completedAt: null,
  ...patch,
});

describe('report requirements from the template', () => {
  it('needs every printed fact, the facts behind derived names, and company details', () => {
    const needs = reportRequirements(
      ['consumer_name', 'earthing_details', 'inverter_make_model', 'vendor_name', 'site_category'],
      new Set(),
    );
    expect(needs.facts).toEqual(['consumer_name', 'earthing_resistance', 'inverter_make']);
    expect(needs.company).toEqual(['legalName']);
  });

  it('leaves out what the template prints only when present', () => {
    const needs = reportRequirements(
      ['sanction_number', 'sanction_date', 'lightning_arrester_text'],
      new Set(['sanction_date', 'lightning_arrester_text']),
    );
    expect(needs.facts).toEqual(['sanction_number']);
  });

  it('never asks for the internal signature and stamp images', () => {
    expect(reportRequirements(['__signature', '__stamp'], new Set()).facts).toEqual([]);
  });
});

describe('report triggers', () => {
  it('waits for the task that names the report until it is completed', () => {
    const open = task({});
    expect(reportWaitsFor('wcr', [open])?.title).toBe('Installation check and sign-off');
    expect(reportWaitsFor('wcr', [task({ status: 'completed' })])).toBeNull();
  });

  it('does not wait when no task on the project names the report', () => {
    expect(reportWaitsFor('dcr', [task({})])).toBeNull();
  });

  it('is ready once any of several naming tasks is done', () => {
    const tasks = [task({}), task({ templateKey: 'other', status: 'completed' })];
    expect(reportWaitsFor('wcr', tasks)).toBeNull();
  });
});

describe('dates from tasks', () => {
  it('takes the installation and commissioning dates in India from completed tasks', () => {
    const facts = taskDateFacts([
      task({ status: 'completed', completedAt: new Date('2026-10-30T20:00:00Z') }),
      task({ templateKey: 'testing_commissioning', completedAt: null }),
    ]);
    // 20:00 UTC is 01:30 the next day in India.
    expect(facts).toEqual({ installation_date: '2026-10-31' });
  });
});

describe('unknownReportNames', () => {
  it('knows recorded facts, worked-out names and the signature images', () => {
    expect(
      unknownReportNames(['consumer_name', 'vendor_name', 'project_onboarded_date', '__stamp']),
    ).toEqual([]);
  });

  it('lists names nobody records, once each', () => {
    expect(unknownReportNames(['consumer_name', 'roof_colour', 'roof_colour', 'pet_name'])).toEqual(
      ['pet_name', 'roof_colour'],
    );
  });
});
