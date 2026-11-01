import type { ProjectDetail } from '@oneohm/api-contracts';
import type { TrackerStage } from '@oneohm/design-system/web';
import { EPC_STAGES } from '@oneohm/domain';

/** The seven EPC stages as tracker segments, each filled to the share of its tasks done. */
export function stagesOf(project: ProjectDetail, name: (stage: string) => string): TrackerStage[] {
  const waiting = project.waitingOn !== null && project.waitingOn !== 'internal';
  return EPC_STAGES.map((stage) => {
    const tasks = project.tasks.filter((task) => task.stage === stage);
    const finished = tasks.length > 0 && tasks.every((task) => task.status === 'completed');
    let status: TrackerStage['status'] = 'pending';
    if (project.skippedStages.includes(stage) || tasks.length === 0) status = 'skipped';
    else if (stage === project.currentStage && project.status === 'active')
      status = waiting ? 'waiting' : 'active';
    else if (finished) status = 'completed';
    const done = tasks.filter((task) => task.status === 'completed').length;
    return {
      id: stage,
      name: name(stage),
      status,
      progress: tasks.length ? done / tasks.length : 0,
    };
  });
}

const SWATCHES = [
  'bg-swatch-0',
  'bg-swatch-1',
  'bg-swatch-2',
  'bg-swatch-3',
  'bg-swatch-4',
  'bg-swatch-5',
] as const;

/** A project keeps one identity swatch everywhere (room header, card edge, table row). */
export function projectSwatch(code: string): string {
  const sum = [...code].reduce((total, char) => total + char.charCodeAt(0), 0);
  return SWATCHES[sum % SWATCHES.length] ?? SWATCHES[0];
}
