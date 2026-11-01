import { describe, expect, it } from 'vitest';
import { generateTasks } from './generate-tasks';
import { DEFAULT_TASK_LIBRARY } from './task-library';
import type { ProjectFacts } from './task-template';

const facts = (discomCode: string): ProjectFacts => ({
  projectType: 'residential',
  discomCode,
  loan: false,
  battery: false,
  groundMount: false,
  subsidy: true,
  nameChange: false,
});

describe('DISCOM task sets', () => {
  it.each(['TATA', 'ADANI', 'BEST'])('gives %s its own track to operational', (code) => {
    const tasks = generateTasks(DEFAULT_TASK_LIBRARY, facts(code), '2026-11-02');
    const prefix = code.toLowerCase();
    const keys = tasks.map((task) => task.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        `${prefix}_application`,
        `${prefix}_sanction`,
        `${prefix}_inspection`,
        `${prefix}_net_meter`,
      ]),
    );
    expect(keys).not.toContain('discom_application');
    const netMeter = tasks.find((task) => task.key === `${prefix}_net_meter`);
    expect(netMeter?.onComplete).toBe('project_operational');
    // The sanction number is recorded for every DISCOM, not only MSEDCL.
    expect(tasks.find((task) => task.key === `${prefix}_sanction`)?.captures).toContain(
      'sanction_number',
    );
    expect(tasks.find((task) => task.key === 'handover')?.dependsOn).toContain(
      `${prefix}_net_meter`,
    );
  });

  it('keeps MSEDCL on its own steps, with the meter fitted before the meter test', () => {
    const tasks = generateTasks(DEFAULT_TASK_LIBRARY, facts('MSEDCL'), '2026-11-02');
    const keys = tasks.map((task) => task.key);
    expect(keys.some((key) => key.startsWith('tata_'))).toBe(false);
    const fit = tasks.find((task) => task.key === 'install_generation_meter');
    expect(fit?.reports).toEqual(['meter-test-letter']);
    expect(tasks.find((task) => task.key === 'generation_meter_test')?.dependsOn).toContain(
      'install_generation_meter',
    );
  });

  it('no longer adds a separate name-change task (a change request does it)', () => {
    const tasks = generateTasks(
      DEFAULT_TASK_LIBRARY,
      { ...facts('MSEDCL'), nameChange: true },
      '2026-11-02',
    );
    expect(tasks.map((task) => task.key)).not.toContain('name_change');
  });
});
