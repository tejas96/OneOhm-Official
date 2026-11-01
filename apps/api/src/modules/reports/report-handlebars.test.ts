import { describe, expect, it } from 'vitest';
import { assetText } from './report-assets';
import { REPORT_DEFINITIONS } from './report-definitions';
import { engine, indianDate, templateVariables, withFillLines } from './report-handlebars';

const FILL = '<span class="rpt-fill"></span>';

/** Required facts a template reads through a derived value (see report-values.ts). */
const FEEDS_DERIVED: Readonly<Record<string, readonly string[]>> = {
  wcr: ['inverter_make'],
};

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
    for (const definition of REPORT_DEFINITIONS) {
      const source = assetText('reports', 'templates', `${definition.key}.hbs`);
      const html = engine.compile(source)({ ...withFillLines(source, {}), __stamp: 'data:x' });
      expect(html.length, definition.key).toBeGreaterThan(500);
      const unused = definition.required.filter((key) => !templateVariables(source).has(key));
      expect(unused, definition.key).toEqual(FEEDS_DERIVED[definition.key] ?? []);
    }
  });
});
