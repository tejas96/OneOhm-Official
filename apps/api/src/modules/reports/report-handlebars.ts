import { formatInr } from '@oneohm/shared';
import Handlebars from 'handlebars';

/**
 * OneOhm's own Handlebars setup for the statutory templates: the helpers and partials
 * they call (signature, vendorSignature, vendorStamp, dateBlank, docTitle).
 */
export const engine = Handlebars.create();

/**
 * A visible line to fill by hand. Printed where a template asks for a detail OneOhm does
 * not record yet, so a gap is always obvious on paper and never silently empty.
 */
export const FILL = new Handlebars.SafeString('<span class="rpt-fill"></span>');

type Value = string | Handlebars.SafeString | undefined | null;

const isFill = (value: unknown): value is Handlebars.SafeString =>
  value instanceof Handlebars.SafeString;

const text = (value: Value): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/** `YYYY-MM-DD` → `DD-MM-YYYY`, the form DISCOM documents use. */
export function indianDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

function orFill(value: Value, format: (present: string) => string) {
  if (isFill(value)) return value;
  const present = text(value);
  return present === null ? FILL : format(present);
}

engine.registerHelper('dash', (value: Value) => orFill(value, (present) => present));
engine.registerHelper('withUnit', (value: Value, unit: unknown) =>
  orFill(value, (present) => (typeof unit === 'string' ? `${present} ${unit}` : present)),
);
engine.registerHelper('formatDate', (value: Value) => orFill(value, indianDate));
engine.registerHelper('rupees', (value: Value) =>
  orFill(value, (present) =>
    /^-?\d+$/.test(present) ? formatInr(Number.parseInt(present, 10)) : present,
  ),
);
engine.registerHelper('formatAadhaar', (value: Value) =>
  orFill(value, (present) => {
    const digits = present.replace(/\D/g, '');
    return digits.length === 12 ? digits.replace(/(\d{4})(?=\d)/g, '$1 ') : present;
  }),
);

engine.registerPartial(
  'signature',
  '<div class="rpt-sig"><div class="rpt-sig-space"></div><div class="rpt-sig-name">{{name}}</div><div class="rpt-sig-rule"></div><div class="rpt-sig-role">{{role}}</div></div>',
);
engine.registerPartial(
  'vendorSignature',
  '<div class="rpt-sig"><div class="rpt-sig-space"><img class="rpt-stamp" src="{{@root.__signature}}" alt="Signature and seal" /></div><div class="rpt-sig-name">{{name}}</div><div class="rpt-sig-rule"></div><div class="rpt-sig-role">{{role}}</div></div>',
);
engine.registerPartial(
  'vendorStamp',
  '<div class="rpt-stamp-block"><img class="rpt-stamp" src="{{@root.__stamp}}" alt="Signature and seal" /></div>',
);
engine.registerPartial(
  'dateBlank',
  '<span class="rpt-date-blank"><span class="rpt-date-hint">DD-MM-YYYY</span></span>',
);
engine.registerPartial(
  'docTitle',
  '<div class="rpt-doc-head"><h1 class="rpt-doc-title">{{title}}</h1>{{#if subtitle}}<p class="rpt-doc-subtitle">{{subtitle}}</p>{{/if}}</div>',
);

interface CallNode {
  readonly path: hbs.AST.PathExpression | hbs.AST.Literal;
  readonly params: hbs.AST.Expression[];
  readonly hash: hbs.AST.Hash | undefined;
}

function readExpression(node: hbs.AST.Expression, names: Set<string>): void {
  if (node.type === 'SubExpression') {
    readCall(node as hbs.AST.SubExpression, names);
    return;
  }
  if (node.type !== 'PathExpression') return;
  const path = node as hbs.AST.PathExpression;
  const head = path.parts[0];
  if (!path.data && head && head !== 'this') names.add(head);
}

function readArguments(node: Omit<CallNode, 'path'>, names: Set<string>): void {
  for (const param of node.params) readExpression(param, names);
  for (const pair of node.hash?.pairs ?? []) readExpression(pair.value, names);
}

/** A mustache, block or sub-expression: a helper call reads its arguments, else its path. */
function readCall(node: CallNode, names: Set<string>): void {
  const path = node.path.type === 'PathExpression' ? (node.path as hbs.AST.PathExpression) : null;
  const isHelper = node.params.length > 0 || (path !== null && path.original in engine.helpers);
  if (!isHelper) readExpression(node.path, names);
  readArguments(node, names);
}

function readProgram(program: hbs.AST.Program | undefined, names: Set<string>): void {
  for (const statement of program?.body ?? []) {
    if (statement.type === 'MustacheStatement') {
      readCall(statement as hbs.AST.MustacheStatement, names);
    } else if (statement.type === 'BlockStatement') {
      const block = statement as hbs.AST.BlockStatement;
      readCall(block, names);
      readProgram(block.program, names);
      readProgram(block.inverse, names);
    } else if (statement.type === 'PartialStatement') {
      readArguments(statement as hbs.AST.PartialStatement, names);
    }
  }
}

/** Every top-level name a template reads (helpers and partials excluded). */
export function templateVariables(source: string): Set<string> {
  const names = new Set<string>();
  readProgram(Handlebars.parse(source), names);
  return names;
}

function readConditions(program: hbs.AST.Program | undefined, names: Set<string>): void {
  for (const statement of program?.body ?? []) {
    if (statement.type !== 'BlockStatement') continue;
    const block = statement as hbs.AST.BlockStatement;
    if (block.path.original === 'if' || block.path.original === 'unless') {
      for (const param of block.params) readExpression(param, names);
    }
    readConditions(block.program, names);
    readConditions(block.inverse, names);
  }
}

/** Names a template tests with `#if` / `#unless`: optional by the template's own design. */
export function conditionVariables(source: string): Set<string> {
  const names = new Set<string>();
  readConditions(Handlebars.parse(source), names);
  return names;
}

/**
 * Template data where every name the template reads has a value: the details OneOhm holds,
 * and a hand-fill line for the rest (required details are checked before this, so only
 * optional ones can reach a fill line). A detail the template itself prints only when
 * present (`{{#if x}}`) is left out instead, as the template intends.
 */
export function withFillLines(
  source: string,
  values: Readonly<Record<string, string>>,
): Record<string, string | Handlebars.SafeString> {
  const conditional = conditionVariables(source);
  const data: Record<string, string | Handlebars.SafeString> = {};
  for (const name of templateVariables(source)) {
    const value = text(values[name]);
    if (value !== null) data[name] = value;
    else if (!conditional.has(name)) data[name] = FILL;
  }
  return data;
}
