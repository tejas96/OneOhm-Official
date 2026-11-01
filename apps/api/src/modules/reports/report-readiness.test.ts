import type { ReportTriggerTask } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../common/http/errors';
import { builtInDefinitions, type ReportDefinition } from './report-definitions';
import {
  assertReportReady,
  projectStatuses,
  type ReportContext,
  reportStatus,
} from './report-readiness';

const definition = (key: string): ReportDefinition => {
  const found = builtInDefinitions().find((entry) => entry.key === key);
  if (!found) throw new Error(`No definition ${key}`);
  return found;
};

const context = (
  facts: Record<string, string>,
  overrides: Partial<ReportContext> = {},
): ReportContext => ({
  facts,
  subsidy: true,
  discomCode: 'MSEDCL',
  discomId: 'msedcl',
  captureTask: new Map([
    ['meter_serial_number', 'Install generation meter'],
    ['sanction_number', 'DISCOM sanction'],
  ]),
  ...overrides,
});

const signatory = {
  legalName: 'OneOhm Energy (test)',
  signatoryName: 'A Signatory',
  signatoryPhone: '+91 90000 00000',
  signatoryEmail: 'sign@example.in',
};
/** The meter letter prints the vendor's name from the company profile. */
const vendor = { legalName: 'OneOhm Energy (test)' };

const METER_FACTS = {
  consumer_name: 'Consumer',
  consumer_number: '123',
  sanction_number: 'S-1',
  sanction_date: '2026-10-01',
  meter_serial_number: 'M-1',
  meter_make: 'Make',
  meter_capacity: '5 kW',
};

describe('reportStatus', () => {
  it('is ready when every required fact is captured', () => {
    const status = reportStatus(definition('meter-test-letter'), context(METER_FACTS), vendor);
    expect(status).toMatchObject({ status: 'ready', missing: [] });
  });

  it('lists each missing fact with its label and the task that captures it', () => {
    const { meter_serial_number: _skip, sanction_number: _blank, ...facts } = METER_FACTS;
    const status = reportStatus(
      definition('meter-test-letter'),
      context({ ...facts, sanction_number: '   ' }),
      vendor,
    );
    expect(status.status).toBe('missing');
    expect(status.missing).toEqual([
      {
        field: 'meter_serial_number',
        label: 'Generation meter serial number',
        taskTitle: 'Install generation meter',
      },
      { field: 'sanction_number', label: 'DISCOM sanction number', taskTitle: 'DISCOM sanction' },
    ]);
  });

  it('reads what the WCR needs from its template, earthing and identity included', () => {
    const required = definition('wcr').required;
    for (const fact of [
      'earthing_resistance',
      'module_model_number',
      'module_warranty',
      'charge_controller_type',
      'inverter_hpd',
      'inverter_year_of_manufacturing',
      'cmc_period_years',
      'consumer_aadhaar_number',
    ]) {
      expect(required).toContain(fact);
    }
    // Printed only when present, so never required.
    expect(required).not.toContain('lightning_arrester_text');
    expect(definition('annexure-proforma-a').required).toContain('installation_date');
    expect(definition('annexure-proforma-a').required).not.toContain('consumer_email');
  });

  it('waits for its trigger task even with every detail in', () => {
    const tasks: ReportTriggerTask[] = [
      {
        templateKey: 'install_generation_meter',
        title: 'Install the generation meter',
        status: 'in_progress',
        reports: ['meter-test-letter'],
        completedAt: null,
      },
    ];
    const waiting = reportStatus(
      definition('meter-test-letter'),
      context(METER_FACTS, { tasks }),
      vendor,
    );
    expect(waiting).toMatchObject({
      status: 'missing',
      missing: [],
      waitingFor: 'Install the generation meter',
    });
    expect(() => assertReportReady(waiting)).toThrow(/once "Install the generation meter"/);
    const done = tasks.map((task) => ({ ...task, status: 'completed', completedAt: new Date() }));
    expect(
      reportStatus(definition('meter-test-letter'), context(METER_FACTS, { tasks: done }), vendor)
        .status,
    ).toBe('ready');
  });

  it('needs the signatory from the company profile for the DCR undertaking', () => {
    const status = reportStatus(definition('dcr'), context({}), { signatoryName: '' });
    const fields = status.missing.map((item) => item.field);
    expect(fields).toContain('signatoryName');
    expect(fields).toContain('signatoryEmail');
    const withSignatory = reportStatus(definition('dcr'), context({}), signatory);
    expect(withSignatory.missing.map((item) => item.field)).not.toContain('signatoryName');
  });

  it('is not needed without subsidy', () => {
    const noSubsidy = context({}, { subsidy: false });
    expect(reportStatus(definition('dcr'), noSubsidy, signatory).status).toBe('not_needed');
  });
});

describe('projectStatuses', () => {
  /** MSEDCL prints the meter letter; Tata has only its own WCR format. */
  const formats = [
    { ...definition('meter-test-letter'), discomId: 'msedcl' },
    { ...definition('wcr'), discomId: 'msedcl' },
    { ...definition('wcr'), discomId: 'tata', name: 'Work Completion Report (Tata)' },
  ];

  it('lists every report any DISCOM prints, in one order, for every project', () => {
    const msedcl = projectStatuses(formats, context(METER_FACTS), vendor);
    const tata = projectStatuses(formats, context(METER_FACTS, { discomId: 'tata' }), vendor);
    expect(msedcl.map((status) => status.key)).toEqual(['meter-test-letter', 'wcr']);
    expect(tata.map((status) => status.key)).toEqual(['meter-test-letter', 'wcr']);
  });

  it("uses the project's own DISCOM's format and is not needed where it has none", () => {
    const tata = projectStatuses(formats, context(METER_FACTS, { discomId: 'tata' }), vendor);
    expect(tata[0]).toMatchObject({ key: 'meter-test-letter', status: 'not_needed' });
    expect(tata[1]?.name).toBe('Work Completion Report (Tata)');
    expect(tata[1]?.status).toBe('missing');
  });
});

describe('assertReportReady', () => {
  it('passes a ready report', () => {
    const status = reportStatus(definition('meter-test-letter'), context(METER_FACTS), vendor);
    expect(() => assertReportReady(status)).not.toThrow();
  });

  it('refuses with 409 and every missing detail as a field error', () => {
    const { meter_make: _make, ...facts } = METER_FACTS;
    const status = reportStatus(definition('meter-test-letter'), context(facts), vendor);
    let error: unknown;
    try {
      assertReportReady(status);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.status).toBe(409);
    expect(appError.code).toBe('report_not_ready');
    expect(appError.message).toContain('Meter make');
    expect(appError.fieldErrors).toEqual({ meter_make: 'Meter make' });
  });

  it('refuses a report the project does not need', () => {
    const status = reportStatus(definition('dcr'), context({}, { subsidy: false }), signatory);
    expect(() => assertReportReady(status)).toThrow(/not needed/);
  });
});
