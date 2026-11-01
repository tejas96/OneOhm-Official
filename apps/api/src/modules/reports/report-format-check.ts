import { factField, factLabel, unknownReportNames } from '@oneohm/domain';
import Handlebars from 'handlebars';
import { invalid } from '../../common/http/errors';
import { COMPANY_FIELD_LABELS, requirementsOf } from './report-definitions';
import { conditionVariables, engine, templateVariables } from './report-handlebars';

/** Handlebars' own block helpers, always available. */
const BUILT_IN_HELPERS = new Set(['if', 'unless', 'each', 'with', 'lookup', 'log']);

interface Uses {
  readonly helpers: Set<string>;
  readonly partials: Set<string>;
}

type Node = hbs.AST.Statement | hbs.AST.Expression;

function readNode(node: Node, uses: Uses): void {
  if (node.type === 'PartialStatement' || node.type === 'PartialBlockStatement') {
    const name = (node as hbs.AST.PartialStatement).name;
    if (name.type === 'PathExpression')
      uses.partials.add((name as hbs.AST.PathExpression).original);
    return;
  }
  if (!['MustacheStatement', 'BlockStatement', 'SubExpression'].includes(node.type)) return;
  const call = node as hbs.AST.MustacheStatement | hbs.AST.BlockStatement | hbs.AST.SubExpression;
  const path = call.path.type === 'PathExpression' ? (call.path as hbs.AST.PathExpression) : null;
  const isCall =
    call.params.length > 0 || (call.hash?.pairs.length ?? 0) > 0 || node.type === 'BlockStatement';
  if (path && isCall) uses.helpers.add(path.original);
  for (const param of call.params) readNode(param, uses);
  for (const pair of call.hash?.pairs ?? []) readNode(pair.value, uses);
  if (node.type === 'BlockStatement') {
    const block = node as hbs.AST.BlockStatement;
    for (const child of [...(block.program?.body ?? []), ...(block.inverse?.body ?? [])])
      readNode(child, uses);
  }
}

/** The helpers and partials a template calls. */
function usesOf(program: hbs.AST.Program): Uses {
  const uses: Uses = { helpers: new Set(), partials: new Set() };
  for (const statement of program.body) readNode(statement, uses);
  return uses;
}

const firstLine = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';

/**
 * Refuses a report format OneOhm cannot print (PRD 3.18): a template that does not read
 * as Handlebars, calls a helper or block OneOhm does not have, or prints a detail nobody
 * records. Returns what it needs from projects and the company profile.
 */
export function checkReportBody(body: string): { field: string; label: string }[] {
  let program: hbs.AST.Program;
  try {
    program = Handlebars.parse(body);
  } catch (error) {
    throw invalid('This template could not be read.', { body: firstLine(error) });
  }
  const uses = usesOf(program);
  const helpers = [...uses.helpers].filter(
    (name) => !BUILT_IN_HELPERS.has(name) && !(name in engine.helpers),
  );
  const partials = [...uses.partials].filter((name) => !(name in engine.partials));
  if (helpers.length + partials.length > 0)
    throw invalid('This template uses blocks OneOhm does not have.', {
      body: `Unknown: ${[...helpers, ...partials].join(', ')}.`,
    });
  const unknown = unknownReportNames(templateVariables(body));
  if (unknown.length > 0)
    throw invalid('This template prints details OneOhm does not record.', {
      body: `Unknown: ${unknown.join(', ')}.`,
    });
  const needs = requirementsOf(body);
  return [
    ...needs.facts.map((field) => ({ field, label: factLabel(field) })),
    ...needs.company.map((field) => ({ field, label: COMPANY_FIELD_LABELS[field] })),
  ];
}

/** A stand-in for each detail a sample shows: a date, a small number, or its name. */
function sampleValue(key: string, today: string): string {
  const field = factField(key);
  if (field.input === 'date') return today;
  if (field.input === 'number') return '5';
  return `[${field.label}]`;
}

/** Sample facts for every detail the template prints or tests, so all of it shows. */
export function sampleFacts(body: string, today: string): Record<string, string> {
  const names = new Set([...requirementsOf(body).facts, ...conditionVariables(body)]);
  return Object.fromEntries([...names].map((name) => [name, sampleValue(name, today)]));
}
