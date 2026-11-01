import type { CustomerDocumentRequest, CustomerProject } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { todosFor } from './todos';

type Line = CustomerProject['payments']['milestones'][number];

const line = (overrides: Partial<Line>): Line => ({
  key: 'advance',
  label: 'Advance on order confirmation',
  payer: 'customer',
  amountPaise: 50_000_00,
  paidPaise: 0,
  status: 'due',
  dueAt: null,
  payUrl: null,
  ...overrides,
});

const project = (milestones: Line[], status: CustomerProject['status'] = 'active') =>
  ({
    id: 'p1',
    code: 'OH-2026-001',
    status,
    stages: [],
    payments: { totalPaise: 0, paidPaise: 0, milestones },
    feedbackGiven: false,
  }) as unknown as CustomerProject;

const request = (overrides: Partial<CustomerDocumentRequest>): CustomerDocumentRequest => ({
  id: 'r1',
  projectCode: 'OH-2026-001',
  category: 'electricity_bill',
  title: 'Light bill (test)',
  note: '',
  status: 'open',
  createdAt: '2026-11-01T00:00:00Z',
  receivedAt: null,
  ...overrides,
});

describe('todosFor (PRD 5.1 pending customer actions)', () => {
  it('lists money due first, then papers, then ratings', () => {
    const todos = todosFor(
      project([line({}), line({ key: 'final', status: 'upcoming' })]),
      [request({})],
      [{ projectId: 'p1', stage: 'survey', rating: null }],
    );
    expect(todos.map((todo) => todo.kind)).toEqual(['payment', 'paper', 'rating']);
  });

  it("never asks for the bank's share or what is already paid", () => {
    const todos = todosFor(
      project([
        line({ payer: 'bank' }),
        line({ key: 'x', status: 'partly_paid', paidPaise: 50_000_00 }),
      ]),
      [],
      [],
    );
    expect(todos).toEqual([]);
  });

  it("keeps to this home's papers and unrated stages", () => {
    const todos = todosFor(
      project([]),
      [
        request({ projectCode: 'OH-2026-009' }),
        request({ id: 'r2', status: 'received' }),
        request({ id: 'r3', projectCode: null }),
      ],
      [
        { projectId: 'p2', stage: 'survey', rating: null },
        { projectId: 'p1', stage: 'installation', rating: { overall: 5 } },
      ],
    );
    expect(todos.map((todo) => todo.id)).toEqual(['paper:r3']);
  });

  it('asks for the overall rating once the system is live', () => {
    expect(todosFor(project([], 'operational'), [], []).map((todo) => todo.kind)).toEqual([
      'feedback',
    ]);
  });
});
