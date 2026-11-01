import type { CustomerProject } from '@oneohm/api-contracts';

type Rated = Pick<CustomerProject, 'id' | 'status' | 'stages' | 'feedbackGiven'>;

/** Running: switched on (commissioning done) or handed over. Same rule as the app's `isLive`. */
export function isLive(project: Pick<CustomerProject, 'status' | 'stages'>): boolean {
  if (project.status === 'operational' || project.status === 'completed') return true;
  return project.stages.some((stage) => stage.stage === 'commissioning' && stage.state === 'done');
}

/**
 * Which home a WhatsApp rating is for: the newest live one not rated yet, else the newest
 * live one. Null until a system is switched on, so "Rate us" waits until then.
 * `projects` come oldest first, as the customer's home lists them.
 */
export function projectToRate(projects: readonly Rated[]): string | null {
  const live = projects.filter(isLive).reverse();
  return (live.find((project) => !project.feedbackGiven) ?? live[0])?.id ?? null;
}
