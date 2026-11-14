import { describe, expect, it, vi } from 'vitest';
import { fillSiteDiscom } from './project-site-discom';

vi.mock('../../common/audit', () => ({ recordAudit: vi.fn(async () => undefined) }));

const fake = (rows: unknown[]) => {
  const set = vi.fn();
  const tx = {
    update: () => ({
      set: (values: unknown) => {
        set(values);
        return { where: () => ({ returning: async () => rows }) };
      },
    }),
  };
  return { tx: tx as never, set };
};

describe('the project DISCOM on the site', () => {
  it('fills a site that has none', async () => {
    const { tx, set } = fake([{ id: 's' }]);
    expect(await fillSiteDiscom(tx, 'u', { id: 's', discomId: null }, 'd1', 'p')).toBe(true);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ discomId: 'd1' }));
  });
  it('keeps a DISCOM the site already has', async () => {
    const { tx, set } = fake([{ id: 's' }]);
    expect(await fillSiteDiscom(tx, 'u', { id: 's', discomId: 'd2' }, 'd1', 'p')).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });
  it('does nothing when the site got one meanwhile', async () => {
    const { tx } = fake([]);
    expect(await fillSiteDiscom(tx, 'u', { id: 's', discomId: null }, 'd1', 'p')).toBe(false);
  });
});
