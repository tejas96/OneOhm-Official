import { describe, expect, it } from 'vitest';
import { filterProjectList, type ListedProject, type ProjectListFilters } from './project-list';

const TODAY = '2026-11-01';

const base: ListedProject = {
  code: 'OH-2026-001',
  name: 'Patil residence',
  place: 'Sangli',
  discom: 'MSEDCL',
  type: 'residential',
  status: 'active',
  capacityWp: 3000,
  tone: 'onTrack',
  waitingOn: null,
  overdueTasks: 0,
  next: { date: '2026-11-05' },
  manager: { id: 'm1' },
  forecast: { slipDays: 0, expectedFinish: '2026-11-20' },
  completedOn: null,
};

const filters: ProjectListFilters = {
  search: '',
  status: 'live',
  health: 'any',
  type: 'all',
  sort: 'due',
  manager: '',
  finish: 'any',
  since: '',
};

const project = (patch: Partial<ListedProject>): ListedProject => ({ ...base, ...patch });
const codes = (list: readonly ListedProject[]) => list.map((item) => item.code);

describe('filterProjectList', () => {
  const list = [
    project({ code: 'OH-1', tone: 'overdue', overdueTasks: 2, next: { date: '2026-11-03' } }),
    project({ code: 'OH-2', status: 'completed', tone: 'done', completedOn: '2026-10-20' }),
    project({ code: 'OH-3', tone: 'waiting', waitingOn: 'discom', next: { date: '2026-11-02' } }),
    project({ code: 'OH-4', type: 'society', capacityWp: 50_000, name: 'Kulkarni society' }),
    project({
      code: 'OH-5',
      status: 'operational',
      forecast: { slipDays: 4, expectedFinish: '2027-02-01' },
    }),
  ];

  it('shows live projects by default, soonest next step first', () => {
    expect(codes(filterProjectList(list, filters, TODAY))).toEqual([
      'OH-3',
      'OH-1',
      'OH-4',
      'OH-5',
    ]);
  });

  it('keeps the links from the command centre working: attention, waiting party, behind', () => {
    expect(codes(filterProjectList(list, { ...filters, health: 'attention' }, TODAY))).toEqual([
      'OH-3',
      'OH-1',
    ]);
    expect(codes(filterProjectList(list, { ...filters, health: 'discom' }, TODAY))).toEqual([
      'OH-3',
    ]);
    expect(codes(filterProjectList(list, { ...filters, finish: 'behind' }, TODAY))).toEqual([
      'OH-5',
    ]);
    expect(codes(filterProjectList(list, { ...filters, finish: 'later' }, TODAY))).toEqual([
      'OH-5',
    ]);
  });

  it('finds completed projects finished since a date', () => {
    const since = { ...filters, status: 'completed' as const, since: '2026-10-01' };
    expect(codes(filterProjectList(list, since, TODAY))).toEqual(['OH-2']);
    expect(filterProjectList(list, { ...since, since: '2026-10-21' }, TODAY)).toEqual([]);
  });

  it('matches every search word in code, name, place or DISCOM', () => {
    const found = filterProjectList(list, { ...filters, search: 'kulkarni sangli' }, TODAY);
    expect(codes(found)).toEqual(['OH-4']);
  });

  it('orders worst first, then by size, with the code breaking ties', () => {
    const attention = filterProjectList(list, { ...filters, sort: 'attention' }, TODAY);
    expect(codes(attention).slice(0, 2)).toEqual(['OH-1', 'OH-3']);
    const size = filterProjectList(list, { ...filters, sort: 'size' }, TODAY);
    expect(codes(size)).toEqual(['OH-4', 'OH-1', 'OH-3', 'OH-5']);
  });

  it('narrows by type and manager', () => {
    expect(codes(filterProjectList(list, { ...filters, type: 'society' }, TODAY))).toEqual([
      'OH-4',
    ]);
    expect(filterProjectList(list, { ...filters, manager: 'm2' }, TODAY)).toEqual([]);
  });
});
