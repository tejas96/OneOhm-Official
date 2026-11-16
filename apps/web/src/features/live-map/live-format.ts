import type { CurrentUser, LivePerson, LiveStateValue } from '@oneohm/api-contracts';

/** Order of the chips and of the list: what needs a look first, then the quiet ones. */
export const STATES: readonly LiveStateValue[] = [
  'on_visit',
  'moving',
  'idle',
  'gap',
  'location_off',
  'on_leave',
  'off_duty',
];

const ON_DUTY = new Set<LiveStateValue>(['on_visit', 'moving', 'idle', 'gap', 'location_off']);
export const isOnDuty = (state: LiveStateValue) => ON_DUTY.has(state);

/** The CSS colour of a state, from the design tokens (`--oh-duty-*`). */
const SWATCH: Readonly<Record<LiveStateValue, string>> = {
  on_visit: 'var(--oh-duty-visit)',
  moving: 'var(--oh-duty-moving)',
  idle: 'var(--oh-duty-idle)',
  gap: 'var(--oh-duty-gap)',
  location_off: 'var(--oh-duty-off)',
  on_leave: 'var(--oh-duty-leave)',
  off_duty: 'var(--oh-duty-off)',
};
export const toneOf = (state: LiveStateValue) => SWATCH[state];

/** A chip filter: everyone, everyone on duty, or one state. */
export type LiveFilter = 'all' | 'on_duty' | LiveStateValue;

export function matchesFilter(state: LiveStateValue, filter: LiveFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'on_duty') return isOnDuty(state);
  return state === filter;
}

export function liveCounts(
  people: readonly LivePerson[],
): Record<'on_duty' | LiveStateValue, number> {
  const counts = {
    on_duty: 0,
    on_visit: 0,
    moving: 0,
    idle: 0,
    gap: 0,
    location_off: 0,
    on_leave: 0,
    off_duty: 0,
  };
  for (const { state } of people) {
    counts[state] += 1;
    if (isOnDuty(state)) counts.on_duty += 1;
  }
  return counts;
}

/** Whole minutes from an instant to now, never negative. */
export const minutesSince = (iso: string, now: number) =>
  Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));

export const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? fullName;

/** The pin's caption: "Ravi · 12.4 km · 64%"; parts without a value are left out. */
export function pinCaption(person: LivePerson): string {
  const parts = [firstName(person.person.fullName)];
  if (person.today.kmSoFar) parts.push(`${person.today.kmSoFar.toFixed(1)} km`);
  const battery = person.position?.batteryPercent;
  if (battery !== null && battery !== undefined) parts.push(`${battery}%`);
  return parts.join(' · ');
}

/** List order: the chip order, then by name. */
export function sortPeople(people: readonly LivePerson[]): LivePerson[] {
  return [...people].sort(
    (a, b) =>
      STATES.indexOf(a.state) - STATES.indexOf(b.state) ||
      a.person.fullName.localeCompare(b.person.fullName),
  );
}

/** Search by name or role, ignoring case and extra spaces. */
export function matchesSearch(person: LivePerson, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${person.person.fullName} ${person.person.roleLabel ?? ''}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

/** `https://wa.me/<digits>`: opens the manager's own WhatsApp; the system sends nothing. */
export const whatsappHref = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;

/** The live map is for HR and for anyone someone reports to. */
export const canSeeLiveMap = (user: Pick<CurrentUser, 'capabilities' | 'hasReports'>) =>
  user.capabilities.includes('people.manage') || user.hasReports === true;

/** Where Open job goes: the task panel on this page, or the service desk's request. */
export function jobHref(site: { id: string; kind: string; projectId: string | null }): string {
  if (site.kind === 'service') return `/service?tab=requests&view=all&request=${site.id}`;
  return `/live?task=${site.id}`;
}
