import type { TravelDay } from '@oneohm/api-contracts';
import { ChoiceChips, Field } from '@oneohm/mobile-ui';
import { COMMON } from '@/copy/common';
import { TRAVEL } from '@/copy/site';

const NONE = 'none';

/** The projects visited on the day, once each, in visit order. */
export function visitedProjects(day: TravelDay): { id: string; code: string }[] {
  const seen = new Map<string, string>();
  for (const visit of day.visits) {
    if (visit.projectId && visit.projectCode && !seen.has(visit.projectId))
      seen.set(visit.projectId, visit.projectCode);
  }
  return [...seen].map(([id, code]) => ({ id, code }));
}

/** With one project visited it is picked already; with several, the person chooses. */
export const defaultProject = (day: TravelDay): string | null => {
  const projects = visitedProjects(day);
  return projects.length === 1 ? (projects[0]?.id ?? null) : null;
};

/** Which visited project the travel was for, so its cost lands on that project. */
export function ClaimProject({
  day,
  value,
  onChange,
}: {
  readonly day: TravelDay;
  readonly value: string | null;
  readonly onChange: (projectId: string | null) => void;
}) {
  const projects = visitedProjects(day);
  if (projects.length === 0) return null;
  return (
    <Field label={TRAVEL.project} hint={TRAVEL.projectHint} optional={COMMON.optional}>
      <ChoiceChips
        label={TRAVEL.project}
        choices={[
          ...projects.map((project) => ({ value: project.id, label: project.code })),
          { value: NONE, label: TRAVEL.noProject },
        ]}
        value={value ?? NONE}
        onChange={(choice) => onChange(choice === NONE ? null : choice)}
      />
    </Field>
  );
}
