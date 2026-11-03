import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { properties } from './schema/crm.schema';
import { documentGeotags, siteVisits } from './schema/site-activity.schema';
import { attendanceDays } from './schema/workforce.schema';

/**
 * The retention sweep (location-retention.ts) only updates attendance days, site
 * visits and photo geotags. A property's site point is business data, not a worker's
 * track, so it must never be among the tables the sweep touches.
 */
describe('location retention leaves property locations alone', () => {
  it('does not import or reference the properties table', async () => {
    const source = await readFile(join(__dirname, 'location-retention.ts'), 'utf8');
    expect(source).not.toMatch(/properties/);
    expect(source).not.toMatch(/crm\.schema/);
  });

  it('keeps the property point columns apart from the cleared tables', () => {
    const kept = ['latitude', 'longitude', 'previousLatitude', 'previousLongitude'];
    const propertyColumns = Object.keys(getTableColumns(properties));
    for (const name of kept) expect(propertyColumns).toContain(name);
    // The cleared tables have their own coordinate columns; none is a property column.
    for (const table of [attendanceDays, siteVisits, documentGeotags]) {
      expect(Object.keys(getTableColumns(table))).not.toContain('previousLatitude');
    }
  });
});
