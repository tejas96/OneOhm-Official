import { describe, expect, it } from 'vitest';
import { inLanguage } from './language';
import { stageLine } from './progress-line';
import { EN } from './words';
import { HI } from './words-hi';
import { MR } from './words-mr';

type Stages = Parameters<typeof stageLine>[0]['stages'];
const stage = (name: string, state: string) => ({ stage: name, state }) as Stages[number];

describe('where a project stands', () => {
  it('names the stage while work is open', () => {
    const stages = [
      stage('survey', 'done'),
      stage('installation', 'current'),
      stage('subsidy', 'upcoming'),
    ];
    expect(stageLine({ stages, currentStage: 'installation' })).toBe(
      'Now: Installation (1 of 3 steps done)',
    );
  });

  it('says a finished project is complete, not "Now: Subsidy" (menu audit M8)', async () => {
    const stages = [
      stage('survey', 'done'),
      stage('installation', 'done'),
      stage('subsidy', 'skipped'),
    ];
    const finished = { stages, currentStage: 'subsidy' as const };
    expect(stageLine(finished)).toBe('All 2 steps done. Your solar system is complete.');
    expect(await inLanguage('mr', async () => stageLine(finished))).toContain('पूर्ण');
    expect(await inLanguage('hi', async () => stageLine(finished))).toContain('पूरा');
  });

  it('words the subsidy inspection in every language (menu audit M9)', () => {
    for (const words of [EN, MR, HI]) expect(words.WORDS.subsidy.inspected).toBeTruthy();
  });
});
