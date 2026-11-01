import { factField } from './fact-fields';
import type { EvidenceKind } from './task-template';

/** One line of a task's checklist (PRD 4.4 "task-specific checklists"). */
export interface ChecklistItem {
  /** The project fact a tick is saved as, e.g. `checklist_site_survey_roof_access`. */
  readonly key: string;
  readonly label: string;
}

/** The tasks that need evidence, as far as the checklist and measurements go. */
export interface EvidenceTask {
  readonly templateKey: string;
  readonly evidence: readonly string[];
  readonly captures: readonly string[];
  /** The template's own checklist (Settings); null or empty uses the built-in one. */
  readonly checklist?: readonly ChecklistLine[] | null;
}

/** A checklist line as written in Settings: a short key and what to check. */
export interface ChecklistLine {
  readonly key: string;
  readonly label: string;
}

type Items = readonly (readonly [key: string, label: string])[];

/** Fixed in code like the fact labels, so the apps, the API and reports agree. */
const CHECKLISTS: Readonly<Record<string, Items>> = {
  site_survey: [
    ['roof_access', 'Safe access to the roof or site'],
    ['shadow_check', 'Shadow from trees, tanks and nearby buildings checked'],
    ['structure_sound', 'Roof or ground can carry the structure'],
    ['cable_route', 'Cable route to the meter agreed with the customer'],
    ['meter_location', 'Meter and distribution board located'],
  ],
  material_reservation: [
    ['quantities_match', 'Quantities match the bill of materials'],
    ['no_damage', 'Panels and inverter checked for damage'],
    ['serials_match', 'Serial numbers match the invoices'],
  ],
  panel_installation: [
    ['clamps_tight', 'Every clamp and bolt tightened'],
    ['strings_as_designed', 'Strings wired as per the design'],
    ['no_cracks', 'No cracked or scratched panels'],
  ],
  installation_complete: [
    ['structure_firm', 'Structure firm and level'],
    ['cables_dressed', 'Cables dressed, tied and in conduit'],
    ['earthing_connected', 'Earthing and lightning arrester connected'],
    ['labels_fixed', 'Danger and isolation labels fixed'],
    ['site_clean', 'Site cleaned and debris removed'],
  ],
  testing_commissioning: [
    ['voc_checked', 'String open-circuit voltage checked'],
    ['insulation_tested', 'Insulation resistance tested'],
    ['inverter_on_grid', 'Inverter synchronised with the grid'],
    ['monitoring_live', 'Monitoring connected and showing generation'],
    ['customer_shown', 'Customer shown how to read the inverter'],
  ],
};

/** For a template made in Settings that asks for a checklist without naming one. */
const ANY_TASK: Items = [
  ['work_done', 'Work done as the task describes'],
  ['site_safe', 'Site left clean and safe'],
];

const MEASUREMENTS: Readonly<Record<string, readonly string[]>> = {
  site_survey: ['roof_length_m', 'roof_width_m', 'shadow_free_area_sqm'],
  earthing_protection: ['earthing_resistance'],
};

/** What a ticked item is saved as. Any non-empty value counts; the apps send this. */
export const CHECKLIST_TICKED = 'yes';

export const checklistFactKey = (templateKey: string, itemKey: string): string =>
  `checklist_${templateKey}_${itemKey}`;

const wants = (task: Pick<EvidenceTask, 'evidence'>, kind: EvidenceKind) =>
  task.evidence.includes(kind);

/** The built-in lines for a template, for Settings to show before anyone edits them. */
export function defaultChecklist(templateKey: string): ChecklistLine[] {
  return (CHECKLISTS[templateKey] ?? ANY_TASK).map(([key, label]) => ({ key, label }));
}

/** "Earthing pit watered and tested" → "earthing_pit_watered_and_tested". */
export function checklistLineKey(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'item'
  );
}

/** The items to tick before the task completes; empty when it needs no checklist. */
export function checklistFor(
  task: Pick<EvidenceTask, 'templateKey' | 'evidence' | 'checklist'>,
): ChecklistItem[] {
  if (!wants(task, 'checklist')) return [];
  const lines =
    task.checklist && task.checklist.length > 0
      ? task.checklist
      : defaultChecklist(task.templateKey);
  return lines.map((line) => ({
    key: checklistFactKey(task.templateKey, line.key),
    label: line.label,
  }));
}

/**
 * The facts a task's measurements are saved as (PRD 3.4 site dimensions and usable
 * area). A Settings template without its own list measures its number facts, or notes
 * its measurements in one field when it has none.
 */
export function measurementsFor(task: EvidenceTask): string[] {
  if (!wants(task, 'measurement')) return [];
  const listed = MEASUREMENTS[task.templateKey];
  if (listed) return [...listed];
  const numbers = task.captures.filter((key) => factField(key).input === 'number');
  return numbers.length > 0 ? numbers : ['site_measurements'];
}
