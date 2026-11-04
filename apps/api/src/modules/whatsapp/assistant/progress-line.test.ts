import { describe, expect, it } from 'vitest';
import { inLanguage } from './language';
import { stageCount, stepTicks } from './progress-line';
import { PROJECT_LISTS } from './project-words';
import { EN } from './words';
import { HI } from './words-hi';
import { MR } from './words-mr';

type Stages = Parameters<typeof stepTicks>[0]['stages'];
const stage = (name: string, state: string) => ({ stage: name, state }) as Stages[number];

describe('where a project stands', () => {
  it('ticks each step while work is open, and counts them for Home', () => {
    const stages = [
      stage('survey', 'done'),
      stage('installation', 'current'),
      stage('net_metering', 'skipped'),
      stage('subsidy', 'upcoming'),
    ];
    const project = { stages, currentStage: 'installation' as const };
    expect(stepTicks(project)).toBe('✅ Site visit\n▶️ Installation\n⚪ Subsidy');
    expect(stageCount(project)).toEqual({
      stage: 'Installation',
      done: 1,
      steps: 3,
      complete: false,
    });
  });

  it('says a finished project is complete, not "Now: Subsidy" (menu audit M8)', async () => {
    const stages = [
      stage('survey', 'done'),
      stage('installation', 'done'),
      stage('subsidy', 'skipped'),
    ];
    const finished = { stages, currentStage: 'subsidy' as const };
    expect(stepTicks(finished)).toBe('All 2 steps done. Your solar system is complete.');
    expect(await inLanguage('mr', async () => stepTicks(finished))).toContain('पूर्ण');
    expect(await inLanguage('hi', async () => stepTicks(finished))).toContain('पूरा');
  });

  it('words the subsidy inspection in every language (menu audit M9)', () => {
    for (const words of [EN, MR, HI]) expect(words.WORDS.subsidy.inspected).toBeTruthy();
  });

  it('ends Hindi sentences with "।" (review F9)', () => {
    expect(HI.ANSWER_WORDS.allDone(7)).toBe('सभी 7 चरण पूरे। आपका सोलर सिस्टम पूरा हो गया है।');
  });

  it('says a home is no longer active, in every language (review F4)', () => {
    expect(PROJECT_LISTS.en.homeGone).toBe('That home is no longer active.');
    for (const [words, project] of [
      [MR, PROJECT_LISTS.mr],
      [HI, PROJECT_LISTS.hi],
    ] as const) {
      expect(words.WORDS.noProject).not.toBe(EN.WORDS.noProject);
      expect(project.homeGone).not.toBe(PROJECT_LISTS.en.homeGone);
    }
  });
});
