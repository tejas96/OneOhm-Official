import type { CustomerProject } from '@oneohm/api-contracts';
import { ANSWER_WORDS, WORDS } from './words';

type Stages = Pick<CustomerProject, 'stages' | 'currentStage'>;

const TICK = { done: '✅', current: '▶️', upcoming: '⚪' } as const;

/** How far a project is: its stage now, steps done and counted (skipped ones never count). */
export function stageCount(project: Stages) {
  const done = project.stages.filter((stage) => stage.state === 'done').length;
  const steps = project.stages.filter((stage) => stage.state !== 'skipped').length;
  const stage = WORDS.stage[project.currentStage] ?? project.currentStage;
  return { stage, done, steps, complete: steps > 0 && done === steps };
}

/**
 * Each step ticked, one per line ("✅ Site visit", "▶️ Installation", "⚪ Subsidy"), or,
 * once every step is done, that the system is complete (menu audit M8).
 */
export function stepTicks(project: Stages): string {
  const { steps, complete } = stageCount(project);
  if (complete) return ANSWER_WORDS.allDone(steps);
  return project.stages
    .filter((stage) => stage.state !== 'skipped')
    .map((stage) => {
      const state = stage.state as keyof typeof TICK;
      return `${TICK[state]} ${WORDS.stage[stage.stage] ?? stage.stage}`;
    })
    .join('\n');
}
