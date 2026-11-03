import type { CustomerProject } from '@oneohm/api-contracts';
import { ANSWER_WORDS, WORDS } from './words';

/**
 * Where a project stands, as one line: "Now: Installation (3 of 7 steps done)", or, once
 * every step is done, that the system is complete (menu audit M8), never "Now: Subsidy".
 */
export function stageLine(project: Pick<CustomerProject, 'stages' | 'currentStage'>): string {
  const done = project.stages.filter((stage) => stage.state === 'done').length;
  const steps = project.stages.filter((stage) => stage.state !== 'skipped').length;
  if (steps > 0 && done === steps) return ANSWER_WORDS.allDone(steps);
  const stage = WORDS.stage[project.currentStage] ?? project.currentStage;
  return ANSWER_WORDS.now(stage, done, steps);
}
