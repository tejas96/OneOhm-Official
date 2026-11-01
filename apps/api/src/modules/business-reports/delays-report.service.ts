import { Inject, Injectable } from '@nestjs/common';
import type { BusinessReportQuery, DelaysReport } from '@oneohm/api-contracts';
import { bucketIndexOf, type EpcStage, WAITING_PARTIES, type WaitingParty } from '@oneohm/domain';
import { DATABASE, type Database } from '../../config/core.module';
import type { CsvTable } from './csv';
import { type DelayFact, delayFact, readDelayTasks, stepDays } from './delays-report.read';
import { average, type ReportScope, reportScope } from './report-scope';

type PartyCounts = Record<WaitingParty, number>;
const zero = (): PartyCounts => ({ internal: 0, customer: 0, bank: 0, discom: 0 });
const daysOf = (facts: readonly DelayFact[]) => facts.reduce((sum, f) => sum + f.daysLate, 0);
/** Late in the report's sense: finished late in the period, or open and past due today. */
const isLate = (fact: DelayFact) => fact.daysLate > 0 && (fact.finished || fact.open);
const STARTED = new Set(['in_progress', 'waiting', 'in_review']);
const STEP_ROWS = 12;
const WAITING_ROWS = 25;

const PARTY_WORDS: Readonly<Record<WaitingParty, string>> = {
  internal: 'Internal',
  customer: 'Customer',
  bank: 'Bank',
  discom: 'DISCOM',
};
const STAGE_WORDS: Readonly<Record<EpcStage, string>> = {
  survey: 'Survey',
  design: 'Design',
  material: 'Material',
  installation: 'Installation',
  commissioning: 'Commissioning',
  net_metering: 'Net metering',
  subsidy: 'Subsidy',
};

/** Where days are lost and on whom (PRD 3.1, 3.8). */
@Injectable()
export class DelaysReportService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async report(query: BusinessReportQuery): Promise<DelaysReport> {
    const scope = reportScope(query);
    const rows = await readDelayTasks(this.db, scope);
    return buildDelays(
      scope,
      rows.map((row) => delayFact(row, scope)),
    );
  }

  csv(report: DelaysReport): CsvTable {
    return {
      fileName: `OneOhm delays ${report.meta.range.start} to ${report.meta.range.end}`,
      headers: ['Step', 'Stage', 'Cause', 'Times late', 'Still open', 'Days late', 'Average days'],
      rows: report.steps.map((row) => [
        row.title,
        STAGE_WORDS[row.stage],
        PARTY_WORDS[row.party],
        row.late,
        row.open,
        row.days,
        row.averageDays,
      ]),
    };
  }
}

/** The whole report from the period's facts; pure, so it is tested without a database. */
export function buildDelays(
  scope: Pick<ReportScope, 'meta'>,
  facts: readonly DelayFact[],
): DelaysReport {
  return {
    meta: scope.meta,
    totals: {
      finished: facts.filter((f) => f.finished).length,
      finishedLate: facts.filter((f) => f.finished && f.daysLate > 0).length,
      openLate: facts.filter((f) => f.open && f.daysLate > 0).length,
      waitingNow: facts.filter((f) => f.open && f.status === 'waiting').length,
    },
    byParty: WAITING_PARTIES.map((party) => {
      const late = facts.filter((f) => f.party === party && isLate(f));
      const finished = late.filter((f) => f.finished);
      const open = late.filter((f) => f.open);
      return {
        party,
        finishedLate: finished.length,
        finishedDays: daysOf(finished),
        openLate: open.length,
        openDays: daysOf(open),
      };
    }),
    byBucket: delayBuckets(scope, facts),
    steps: slowestSteps(facts),
    discoms: byDiscom(facts),
    waiting: waitingNow(facts),
  };
}

function delayBuckets(scope: Pick<ReportScope, 'meta'>, facts: readonly DelayFact[]) {
  const rows = scope.meta.buckets.map((bucket) => ({ ...bucket, days: zero(), tasks: zero() }));
  for (const fact of facts) {
    if (!fact.finished || !fact.finishedOn || fact.daysLate === 0) continue;
    const row = rows[bucketIndexOf(scope.meta.buckets, fact.finishedOn)];
    if (!row) continue;
    row.days[fact.party] += fact.daysLate;
    row.tasks[fact.party] += 1;
  }
  return rows;
}

const groupBy = <K>(facts: readonly DelayFact[], key: (fact: DelayFact) => K) => {
  const groups = new Map<K, DelayFact[]>();
  for (const fact of facts) groups.set(key(fact), [...(groups.get(key(fact)) ?? []), fact]);
  return groups;
};

/** The name most of a step's tasks carry (ties alphabetical), so one step reads as one row. */
function usualTask(list: readonly DelayFact[]): DelayFact | undefined {
  const counts = new Map<string, number>();
  for (const fact of list) counts.set(fact.title, (counts.get(fact.title) ?? 0) + 1);
  const ranked = [...list].sort(
    (a, b) =>
      (counts.get(b.title) ?? 0) - (counts.get(a.title) ?? 0) || a.title.localeCompare(b.title),
  );
  return ranked[0];
}

/** The cause with the most late days; ties go to the earlier one (internal first). */
function mainParty(list: readonly DelayFact[]): WaitingParty {
  const days = zero();
  for (const fact of list) days[fact.party] += fact.daysLate;
  return WAITING_PARTIES.reduce((best, party) => (days[party] > days[best] ? party : best));
}

export function slowestSteps(facts: readonly DelayFact[]): DelaysReport['steps'] {
  const groups = groupBy(facts.filter(isLate), (fact) => fact.templateKey);
  return [...groups.entries()]
    .flatMap(([templateKey, list]) => {
      const usual = usualTask(list);
      if (!usual) return [];
      return [
        {
          templateKey,
          title: usual.title,
          stage: usual.stage,
          party: mainParty(list),
          late: list.length,
          open: list.filter((f) => f.open).length,
          days: daysOf(list),
          averageDays: average(list.map((f) => f.daysLate)),
        },
      ];
    })
    .sort((a, b) => b.days - a.days || b.late - a.late || a.title.localeCompare(b.title))
    .slice(0, STEP_ROWS);
}

export function byDiscom(facts: readonly DelayFact[]): DelaysReport['discoms'] {
  const utility = facts.filter((f) => f.party === 'discom' && (f.finished || f.open));
  return [...groupBy(utility, (fact) => fact.discomId).entries()]
    .map(([discomId, list]) => {
      const finished = list.filter((f) => f.finished);
      const late = list.filter(isLate);
      return {
        discomId,
        code: list[0]?.discomCode ?? '',
        name: list[0]?.discomName ?? '',
        finished: finished.length,
        late: finished.filter((f) => f.daysLate > 0).length,
        lateDays: daysOf(late),
        averageDays: average(
          finished.map(stepDays).filter((days): days is number => days !== null),
        ),
        openNow: list.filter((f) => f.open && STARTED.has(f.status)).length,
        openLate: list.filter((f) => f.open && f.daysLate > 0).length,
      };
    })
    .filter((row) => row.finished + row.openNow + row.openLate > 0)
    .sort((a, b) => b.lateDays - a.lateDays || b.finished - a.finished);
}

export function waitingNow(facts: readonly DelayFact[]): DelaysReport['waiting'] {
  const longest = (fact: DelayFact) => Math.max(fact.daysLate, fact.waitingDays ?? 0);
  return facts
    .filter((f) => f.open && (f.daysLate > 0 || f.waitingDays !== null))
    .sort((a, b) => longest(b) - longest(a) || a.dueDate.localeCompare(b.dueDate))
    .slice(0, WAITING_ROWS)
    .map((fact) => ({
      taskId: fact.id,
      projectId: fact.projectId,
      projectCode: fact.projectCode,
      projectName: fact.projectName,
      title: fact.title,
      party: fact.party,
      waiting: fact.waitingDays !== null,
      dueDate: fact.dueDate,
      daysLate: fact.daysLate,
      waitingDays: fact.waitingDays,
    }));
}
