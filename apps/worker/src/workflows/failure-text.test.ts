import { describe, expect, it } from 'vitest';
import { failureText } from './failure-text';

describe('failureText', () => {
  it('takes the innermost message of a wrapped error', () => {
    const inner = new Error('connection refused');
    const outer = new Error('Activity task failed', { cause: inner });
    expect(failureText(outer)).toBe('connection refused');
  });

  it('copes with a plain value and an empty message', () => {
    expect(failureText('boom')).toBe('boom');
    expect(failureText(new Error(''))).toBe('The job failed.');
  });
});
