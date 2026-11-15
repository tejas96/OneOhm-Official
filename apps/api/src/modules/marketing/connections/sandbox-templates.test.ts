import { describe, expect, it } from 'vitest';
import { practiceApprovedKeys } from './sandbox-templates';

describe('practiceApprovedKeys', () => {
  it('counts only the approved practice messages', () => {
    const keys = practiceApprovedKeys({
      a: { approved: true, withImage: true },
      b: { approved: false, withImage: false },
    });
    expect([...keys]).toEqual(['a']);
  });
});
