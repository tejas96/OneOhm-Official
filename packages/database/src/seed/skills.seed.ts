import type { Database } from '../client';
import { skills } from '../schema';

/** A starting list for an EPC team (PRD 3.7). Owners rename, add or switch them off. */
const STARTER_SKILLS = [
  {
    key: 'site_survey',
    name: 'Site survey and design',
    description: 'Roof and shadow survey, string design, cable routes.',
  },
  {
    key: 'electrical_licence',
    name: 'Licensed wireman',
    description: 'Holds a valid wireman or electrical contractor licence for AC work.',
  },
  {
    key: 'work_at_height',
    name: 'Working at height',
    description: 'Trained and fit for rooftop and ladder work with harness.',
  },
  {
    key: 'net_metering',
    name: 'Net metering and DISCOM portal',
    description: 'Files MSEDCL applications and follows them up.',
  },
  {
    key: 'inverter_service',
    name: 'Inverter troubleshooting',
    description: 'Reads inverter error codes and fixes common faults.',
  },
  {
    key: 'battery_systems',
    name: 'Battery systems',
    description: 'Installs and services hybrid inverters and batteries.',
  },
] as const;

/** Adds the starter skills once; existing rows (and owners' edits) are left alone. */
export async function seedSkills(db: Database): Promise<void> {
  await db
    .insert(skills)
    .values(STARTER_SKILLS.map((skill, position) => ({ ...skill, position })))
    .onConflictDoNothing();
}
