import {
  type CostingCard,
  MATERIAL_KINDS,
  type RateKind,
  STRUCTURE_TYPES,
  type StructureType,
} from './costing-card';
import type { CostingDetail } from './costing-detail';

export interface CardProblem {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/** Keys the engine gives its own lines; a rate line may not take them. */
const RESERVED = new Set(['panel', 'inverter', 'battery', 'structure', 'transport']);
const KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

/** Where a rate line is used, in words a person reads. */
export interface RateUse {
  readonly where: 'job' | 'extraFloor' | 'part' | 'route' | 'routing' | 'crew' | 'equipment';
  readonly site: StructureType | null;
}

/** Every place the card prices with this rate line. */
export function rateUses(card: CostingCard, key: string): RateUse[] {
  const uses: RateUse[] = [];
  if (card.jobItems.some((item) => item.rate === key)) uses.push({ where: 'job', site: null });
  if (card.extraFloor.rate === key) uses.push({ where: 'extraFloor', site: null });
  for (const site of STRUCTURE_TYPES) {
    const setup = card.sites[site];
    if (setup.parts.some((part) => part.rate === key)) uses.push({ where: 'part', site });
    if (setup.routes.some((route) => route.cable === key)) uses.push({ where: 'route', site });
    if (setup.routes.some((route) => route.routing === key)) uses.push({ where: 'routing', site });
    if (setup.crew.some((member) => member.rate === key)) uses.push({ where: 'crew', site });
    if (setup.equipment.some((rule) => rule.rate === key)) uses.push({ where: 'equipment', site });
  }
  return uses;
}

/**
 * Why a card cannot be saved, or nothing: rate line keys are unique and free, every rate
 * a site or job item names exists and is of the right kind, products sit only on stock,
 * and the target margin leaves room for a price.
 */
export function cardProblems(card: CostingCard): CardProblem[] {
  const problems: CardProblem[] = [];
  const kinds = new Map<string, RateKind>();
  card.rateLines.forEach((line, index) => {
    if (
      !KEY_PATTERN.test(line.key) ||
      RESERVED.has(line.key) ||
      /^(extra|inverter)_\d+$/.test(line.key)
    ) {
      problems.push({ path: ['rateLines', index, 'key'], message: 'Use another short name.' });
    } else if (kinds.has(line.key)) {
      problems.push({ path: ['rateLines', index, 'key'], message: 'Another rate uses this name.' });
    }
    kinds.set(line.key, line.kind);
    if (line.productId && !MATERIAL_KINDS.includes(line.kind)) {
      problems.push({
        path: ['rateLines', index, 'productId'],
        message: 'Only stock items name a product.',
      });
    }
  });
  const need = (path: CardProblem['path'], key: string | null, allowed: readonly RateKind[]) => {
    if (key === null) return;
    const kind = kinds.get(key);
    if (!kind) problems.push({ path, message: 'Pick a rate that exists.' });
    else if (!allowed.includes(kind))
      problems.push({ path, message: 'Pick a rate of the right kind.' });
  };
  const any: readonly RateKind[] = [
    'structure',
    'cable',
    'routing',
    'electrical',
    'labour',
    'equipment',
    'service',
    'other',
  ];
  card.jobItems.forEach((item, index) => {
    need(['jobItems', index, 'rate'], item.rate, any);
  });
  need(['extraFloor', 'rate'], card.extraFloor.rate, ['labour']);
  for (const site of STRUCTURE_TYPES) checkSite(card, site, need);
  if (card.pricing.marginBp >= 9_000) {
    problems.push({ path: ['pricing', 'marginBp'], message: 'Use a margin below 90%.' });
  }
  return problems;
}

type Need = (path: CardProblem['path'], key: string | null, allowed: readonly RateKind[]) => void;

function checkSite(card: CostingCard, site: StructureType, need: Need): void {
  const setup = card.sites[site];
  const at = (...rest: (string | number)[]) => ['sites', site, ...rest];
  setup.parts.forEach((part, index) => {
    need(at('parts', index, 'rate'), part.rate, ['structure', 'labour', 'other']);
  });
  setup.routes.forEach((route, index) => {
    need(at('routes', index, 'cable'), route.cable, ['cable']);
    need(at('routes', index, 'routing'), route.routing, ['routing']);
  });
  setup.crew.forEach((member, index) => {
    need(at('crew', index, 'rate'), member.rate, ['labour']);
  });
  setup.equipment.forEach((rule, index) => {
    need(at('equipment', index, 'rate'), rule.rate, ['equipment']);
  });
}

/**
 * Why a quotation's own detail cannot be priced with this card: every cable, routing,
 * structure part, crew and equipment rate it names must still exist, of the right kind.
 */
export function detailProblems(card: CostingCard, detail: CostingDetail): CardProblem[] {
  const problems: CardProblem[] = [];
  const kindOf = (key: string) => card.rateLines.find((line) => line.key === key)?.kind;
  const need = (path: CardProblem['path'], key: string | null | undefined, allowed: RateKind[]) => {
    if (key === null || key === undefined) return;
    const kind = kindOf(key);
    if (!kind || !allowed.includes(kind))
      problems.push({ path: ['costing', ...path], message: 'This rate is no longer on the card.' });
  };
  detail.runs?.forEach((run, index) => {
    need(['runs', index, 'cable'], run.cable, ['cable']);
    need(['runs', index, 'routing'], run.routing, ['routing']);
  });
  detail.structure?.parts?.forEach((part, index) => {
    need(['structure', 'parts', index, 'rate'], part.rate, ['structure', 'labour', 'other']);
  });
  detail.crew?.forEach((member, index) => {
    need(['crew', index, 'rate'], member.rate, ['labour']);
  });
  detail.equipment?.forEach((item, index) => {
    need(['equipment', index, 'rate'], item.rate, ['equipment']);
  });
  return problems;
}
