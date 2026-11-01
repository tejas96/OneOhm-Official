import { describe, expect, it } from 'vitest';
import { AppError } from '../../common/http/errors';
import { REPORT_DEFINITIONS, type ReportDefinition } from './report-definitions';
import { assertReportReady, type ReportContext, reportStatus } from './report-readiness';

const definition = (key: string): ReportDefinition => {
  const found = REPORT_DEFINITIONS.find((entry) => entry.key === key);
  if (!found) throw new Error(`No definition ${key}`);
  return found;
};

const context = (facts: Record<string, string>, overrides: Partial<ReportContext> = {}) => ({
  facts,
  subsidy: true,
  discomCode: 'MSEDCL',
  captureTask: new Map([
    ['meter_serial_number', 'Install generation meter'],
    ['sanction_number', 'DISCOM sanction'],
  ]),
  ...overrides,
});

const signatory = {
  signatoryName: 'A Signatory',
  signatoryPhone: '+91 90000 00000',
  signatoryEmail: 'sign@example.in',
};

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
    const status = reportStatus(definition('meter-test-letter'), context(METER_FACTS), {});
    expect(status).toMatchObject({ status: 'ready', missing: [] });
  });

  it('lists each missing fact with its label and the task that captures it', () => {
    const { meter_serial_number: _skip, sanction_number: _blank, ...facts } = METER_FACTS;
    const status = reportStatus(
      definition('meter-test-letter'),
      context({ ...facts, sanction_number: '   ' }),
      {},
    );
    expect(status.status).toBe('missing');
    expect(status.missing).toEqual([
      { field: 'sanction_number', label: 'DISCOM sanction number', taskTitle: 'DISCOM sanction' },
      {
        field: 'meter_serial_number',
        label: 'Generation meter serial number',
        taskTitle: 'Install generation meter',
      },
    ]);
  });

  it('needs the signatory from the company profile for the DCR undertaking', () => {
    const status = reportStatus(definition('dcr'), context({}), { signatoryName: '' });
    const fields = status.missing.map((item) => item.field);
    expect(fields).toContain('signatoryName');
    expect(fields).toContain('signatoryEmail');
    const withSignatory = reportStatus(definition('dcr'), context({}), signatory);
    expect(withSignatory.missing.map((item) => item.field)).not.toContain('signatoryName');
  });

  it('is not needed for another DISCOM or without subsidy', () => {
    const otherDiscom = context(METER_FACTS, { discomCode: 'TPC' });
    expect(reportStatus(definition('meter-test-letter'), otherDiscom, {}).status).toBe(
      'not_needed',
    );
    const noSubsidy = context({}, { subsidy: false });
    expect(reportStatus(definition('dcr'), noSubsidy, signatory).status).toBe('not_needed');
  });
});

describe('assertReportReady', () => {
  it('passes a ready report', () => {
    const status = reportStatus(definition('meter-test-letter'), context(METER_FACTS), {});
    expect(() => assertReportReady(status)).not.toThrow();
  });

  it('refuses with 409 and every missing detail as a field error', () => {
    const { meter_make: _make, ...facts } = METER_FACTS;
    const status = reportStatus(definition('meter-test-letter'), context(facts), {});
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
