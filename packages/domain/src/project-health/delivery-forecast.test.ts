import { describe, expect, it } from 'vitest';
import { deliveryForecast, finishWindow } from './delivery-forecast';

describe('deliveryForecast', () => {
  it('finishes on plan when no open task is late', () => {
    expect(
      deliveryForecast([{ dueDate: '2026-11-20' }, { dueDate: '2026-12-05' }], '2026-11-10'),
    ).toEqual({ plannedFinish: '2026-12-05', slipDays: 0, expectedFinish: '2026-12-05' });
  });

  it('moves the plan on by how late the work runs today', () => {
    expect(
      deliveryForecast(
        [{ dueDate: '2026-11-06' }, { dueDate: '2026-11-08' }, { dueDate: '2026-12-05' }],
        '2026-11-10',
      ),
    ).toEqual({ plannedFinish: '2026-12-05', slipDays: 4, expectedFinish: '2026-12-09' });
  });

  it('never expects a finish before today', () => {
    expect(deliveryForecast([{ dueDate: '2026-11-01' }], '2026-11-10').expectedFinish).toBe(
      '2026-11-10',
    );
  });

  it('has no forecast once nothing is open', () => {
    expect(deliveryForecast([], '2026-11-10')).toEqual({
      plannedFinish: null,
      slipDays: 0,
      expectedFinish: null,
    });
  });
});

describe('finishWindow', () => {
  it('puts a finish in this month, the next one, or later', () => {
    expect(finishWindow('2026-11-30', '2026-11-10')).toBe('this_month');
    expect(finishWindow('2026-12-01', '2026-11-10')).toBe('next_month');
    expect(finishWindow('2027-01-02', '2026-11-10')).toBe('later');
    expect(finishWindow('2027-01-15', '2026-12-20')).toBe('next_month');
  });
});
