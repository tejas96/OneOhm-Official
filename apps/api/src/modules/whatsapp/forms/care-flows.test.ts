import { describe, expect, it } from 'vitest';
import { problemFormStart, referFormStart, upiFormStart } from '../../care/care-form-words';
import { REFER_FRIEND_FLOW } from './refer-friend.flow';
import { REPORT_PROBLEM_FLOW } from './report-problem.flow';
import { SHARE_UPI_FLOW } from './share-upi.flow';

const flows = [
  [
    'report_problem',
    REPORT_PROBLEM_FLOW,
    problemFormStart(
      [
        { id: 'a', city: 'Sangli' },
        { id: 'b', city: 'Pune' },
      ],
      {},
    ),
  ],
  ['refer_friend', REFER_FRIEND_FLOW, referFormStart(['Sangli', 'Pune'], {})],
  ['share_upi', SHARE_UPI_FLOW, upiFormStart('₹2,000', {})],
] as const;

describe.each(flows)('the %s form', (_key, flow, start) => {
  const [screen] = flow.screens;

  it('has one terminal screen that completes with named answers', () => {
    expect(flow.screens).toHaveLength(1);
    expect(screen?.terminal).toBe(true);
    expect(JSON.stringify(flow)).toContain('"complete"');
  });

  it('reads only data it declares, and the start data fills every declared field', () => {
    const used = [...JSON.stringify(screen?.layout).matchAll(/\$\{data\.(\w+)\}/g)].map(
      (m) => m[1],
    );
    const declared = Object.keys(screen?.data ?? {});
    for (const name of used) expect(declared, name).toContain(name);
    for (const name of declared) expect(Object.keys(start.data), name).toContain(name);
    expect(start.screen).toBe(screen?.id);
  });
});
