import type { Company } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { assetText } from './report-assets';
import { builtInDefinitions } from './report-definitions';
import { engine, indianDate, templateVariables, withFillLines } from './report-handlebars';
import type { ReportProject } from './report-status.service';
import { reportValues } from './report-values';

const FILL = '<span class="rpt-fill"></span>';

describe('report templates', () => {
  it('reads the variables a template uses, not helper or partial names', () => {
    const names = templateVariables(
      '{{a}} {{withUnit b "Wp"}} {{#if c}}{{d}}{{/if}} {{> signature name=e role="x"}} {{@root.f}}',
    );
    expect([...names].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('prints a hand-fill line, never an empty gap, for details not held', () => {
    const source = '<p>{{known}}|{{unknown}}|{{withUnit watts "Wp"}}|{{formatDate when}}</p>';
    const html = engine.compile(source)(
      withFillLines(source, { known: 'Yes', watts: '540', when: '' }),
    );
    expect(html).toBe(`<p>Yes|${FILL}|540 Wp|${FILL}</p>`);
  });

  it('leaves out an unknown detail the template only prints when present', () => {
    const source = '<p>{{#if extra}}Extra: {{extra}}{{/if}}|{{other}}</p>';
    expect(engine.compile(source)(withFillLines(source, {}))).toBe(`<p>|${FILL}</p>`);
    expect(engine.compile(source)(withFillLines(source, { extra: 'x' }))).toBe(
      `<p>Extra: x|${FILL}</p>`,
    );
  });

  it('formats dates, rupees and Aadhaar the way the forms expect', () => {
    expect(indianDate('2026-10-05')).toBe('05-10-2026');
    const render = engine.compile('{{rupees cost}} {{formatAadhaar id}}');
    expect(render({ cost: '27923100', id: '123412341234' })).toBe('₹2,79,231 1234 1234 1234');
  });

  it('escapes values so facts cannot inject markup', () => {
    const source = '{{name}}';
    expect(engine.compile(source)(withFillLines(source, { name: '<b>x</b>' }))).toBe(
      '&lt;b&gt;x&lt;/b&gt;',
    );
  });

  it('compiles every statutory template with OneOhm partials', () => {
    for (const definition of builtInDefinitions()) {
      const source = assetText('reports', 'templates', `${definition.key}.hbs`);
      const html = engine.compile(source)({ ...withFillLines(source, {}), __stamp: 'data:x' });
      expect(html.length, definition.key).toBeGreaterThan(500);
    }
  });

  it('prints no blank line once every required detail is in (PRD 3.18)', () => {
    for (const definition of builtInDefinitions()) {
      const source = assetText('reports', 'templates', `${definition.key}.hbs`);
      const facts = Object.fromEntries(definition.required.map((key) => [key, '5']));
      const project = {
        code: 'OH-2026-001',
        type: 'residential',
        groundMount: false,
        discomName: 'MSEDCL',
        discomCode: 'MSEDCL',
        discomId: 'msedcl',
        startDate: '2026-11-01',
        subsidy: true,
        facts,
        captureTask: new Map(),
      } satisfies ReportProject;
      const company = Object.fromEntries(
        (definition.company ?? []).map((field) => [field, 'Set']),
      ) as unknown as Company;
      const values = reportValues(project, company, '2026-11-01');
      const html = engine.compile(source)({ ...withFillLines(source, values), __stamp: 'x' });
      expect(html.includes(FILL), definition.key).toBe(false);
    }
  });
});
