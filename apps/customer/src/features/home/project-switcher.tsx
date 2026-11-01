import type { CustomerProject } from '@oneohm/api-contracts';
import { ChoiceChips, formatKwp } from '@oneohm/mobile-ui';
import { COMMON } from '@/copy/common';
import { HOME } from '@/copy/home';

/** Only for customers with more than one home or site. */
export function ProjectSwitcher({
  projects,
  chosenId,
  onChoose,
}: {
  readonly projects: readonly CustomerProject[];
  readonly chosenId: string;
  readonly onChoose: (id: string) => void;
}) {
  if (projects.length < 2) return null;
  return (
    <ChoiceChips
      label={HOME.switcher}
      value={chosenId}
      onChange={onChoose}
      choices={projects.map((project) => ({
        value: project.id,
        label: `${COMMON.projectType[project.type]} · ${project.place} · ${formatKwp(project.capacityWp)}`,
      }))}
    />
  );
}
