import type { CustomerAfterSales, CustomerCover } from '@oneohm/api-contracts';
import { daysBetween } from '@oneohm/shared';
import { plainDate } from './plain-date';
import { PROJECT_WORDS } from './project-words';
import { COVER_WORDS, WORDS } from './words';

type Asset = CustomerCover['assets'][number];
type Visit = CustomerAfterSales['upcomingVisits'][number];

const lines = (rows: readonly string[]) => rows.filter(Boolean).join('\n');

/** "25 years" or "6 months": how long the maker's cover runs, from its two dates. */
export function coverLength(from: string, to: string): string {
  const days = daysBetween(from, to) + 1;
  const years = Math.round(days / 365.25);
  return years >= 1 ? COVER_WORDS.years(years) : COVER_WORDS.months(Math.round(days / 30.44));
}

function assetLines(asset: Asset): string {
  const detail = [asset.make, asset.model].filter(Boolean).join(' ');
  const count = asset.quantity > 1 ? `${asset.quantity} × ` : '';
  const kind = `${COVER_WORDS.kinds[asset.kind] ?? asset.kind}${detail ? ` (${count}${detail})` : ''}`;
  if (asset.warrantyState === 'ended')
    return COVER_WORDS.ended(kind, plainDate(asset.warrantyEndsOn));
  return lines([
    COVER_WORDS.item(
      kind,
      coverLength(asset.warrantyStartsOn, asset.warrantyEndsOn),
      plainDate(asset.warrantyEndsOn),
    ),
    asset.performanceEndsOn ? COVER_WORDS.performance(plainDate(asset.performanceEndsOn)) : '',
  ]);
}

function amcLines(amc: CustomerCover['amc'], next: Visit | undefined): string {
  if (!amc) return COVER_WORDS.noAmc;
  return lines([
    COVER_WORDS.amc(
      amc.planName,
      COVER_WORDS.amcState[amc.state],
      plainDate(amc.startsOn),
      plainDate(amc.endsOn),
    ),
    amc.visitsTotal > 0 ? COVER_WORDS.amcVisits(amc.visitsDone, amc.visitsTotal) : '',
    next ? COVER_WORDS.nextVisit(next.visitName, plainDate(next.dueOn)) : '',
  ]);
}

/**
 * Each home's installed items with their warranty length and end date, then its AMC
 * with the next planned visit: what the app's warranty screen shows, in a few lines.
 * `places` gives each project's town, by project id.
 */
export function coverText(after: CustomerAfterSales, places: ReadonlyMap<string, string>): string {
  if (after.projects.length === 0) return WORDS.noProject;
  const blocks = after.projects.map((cover) => {
    // Named by its town (live review C9); the code only when the town is unknown.
    const place = places.get(cover.projectId);
    const title = `*${place ? PROJECT_WORDS.projectIn(place) : cover.projectCode}*`;
    const next = after.upcomingVisits.find((visit) => visit.projectCode === cover.projectCode);
    if (cover.assets.length === 0)
      return lines([title, COVER_WORDS.notYet, cover.amc ? amcLines(cover.amc, next) : '']);
    return lines([
      title,
      cover.commissionedOn ? COVER_WORDS.since(plainDate(cover.commissionedOn)) : '',
      ...cover.assets.map(assetLines),
      amcLines(cover.amc, next),
    ]);
  });
  const installed = after.projects.some((cover) => cover.assets.length > 0);
  return [...blocks, installed ? COVER_WORDS.help : ''].filter(Boolean).join('\n\n');
}
