import type { ProjectSummary } from '@oneohm/api-contracts';
import type { TrackerStage } from '@oneohm/design-system/web';
import { EPC_STAGES } from '@oneohm/domain';

/**
 * Stage segments from a project summary, which only knows the current stage and how far
 * it is: earlier stages count as complete, later ones as not started, unused ones hatched.
 */
export function stagesFromSummary(
  project: ProjectSummary,
  name: (stage: string) => string,
): TrackerStage[] {
  const current = EPC_STAGES.indexOf(project.currentStage);
  const finished = project.status === 'completed';
  const live = project.status === 'active' || project.status === 'operational';
  const waiting = project.waitingOn !== null && project.waitingOn !== 'internal';
  return EPC_STAGES.map((stage, index) => {
    let status: TrackerStage['status'] = 'pending';
    if (project.skippedStages.includes(stage)) status = 'skipped';
    else if (finished || index < current) status = 'completed';
    else if (index === current && live) status = waiting ? 'waiting' : 'active';
    return { id: stage, name: name(stage), status, progress: project.stageProgress };
  });
}

/** One short sentence on why a project needs a look, or null when nothing stands out. */
export function attentionReason(
  project: ProjectSummary,
): { key: 'overdue' | 'waiting'; count: number } | null {
  if (project.overdueTasks > 0) return { key: 'overdue', count: project.overdueTasks };
  if (project.waitingOn && project.waitingOn !== 'internal')
    return { key: 'waiting', count: project.waitingDays };
  return null;
}
