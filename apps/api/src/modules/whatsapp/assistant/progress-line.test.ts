import { describe, expect, it } from 'vitest';
import { inLanguage } from './language';
import { stageLine } from './progress-line';
import { PROJECT_LISTS } from './project-words';
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

  it('ends Hindi sentences with "।" (review F9)', () => {
    expect(HI.ANSWER_WORDS.allDone(7)).toBe('सभी 7 चरण पूरे। आपका सोलर सिस्टम पूरा हो गया है।');
  });

  it('says thanks back and a home no longer active, in every language (review F4, F7)', () => {
    expect(EN.WORDS.welcome).toBe('You’re welcome 🙏');
    expect(PROJECT_LISTS.en.homeGone).toBe('That home is no longer active.');
    for (const [words, project] of [
      [MR, PROJECT_LISTS.mr],
      [HI, PROJECT_LISTS.hi],
    ] as const) {
      expect(words.WORDS.welcome).not.toBe(EN.WORDS.welcome);
      expect(project.homeGone).not.toBe(PROJECT_LISTS.en.homeGone);
    }
  });
});
