/**
 * How a lead nobody picked finds its owner (website, WhatsApp, referral, reseller,
 * reopen). Owners change it in Settings → Assignment; the default is how OneOhm has
 * always done it.
 */
export const LEAD_ASSIGNMENT_STRATEGIES = ['least_busy', 'round_robin'] as const;
export type LeadAssignmentStrategy = (typeof LEAD_ASSIGNMENT_STRATEGIES)[number];

/** Most cities one person can own. */
export const MAX_CITIES_PER_OWNER = 50;

export interface LeadAssignmentRules {
  /** Least busy: fewest open leads. Round robin: whoever got a lead longest ago. */
  readonly strategy: LeadAssignmentStrategy;
  /** People who take the leads of their cities first. */
  readonly cityOwners: readonly {
    readonly userId: string;
    readonly cities: readonly string[];
  }[];
}

export const DEFAULT_LEAD_ASSIGNMENT: LeadAssignmentRules = {
  strategy: 'least_busy',
  cityOwners: [],
};

function isCityOwner(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const owner = value as Record<string, unknown>;
  return (
    typeof owner.userId === 'string' &&
    owner.userId.trim() !== '' &&
    Array.isArray(owner.cities) &&
    owner.cities.length <= MAX_CITIES_PER_OWNER &&
    owner.cities.every((city) => typeof city === 'string')
  );
}

/** True when the saved lead rule is complete and known. */
export function isLeadAssignmentRules(value: unknown): value is LeadAssignmentRules {
  if (!value || typeof value !== 'object') return false;
  const rules = value as Record<string, unknown>;
  return (
    LEAD_ASSIGNMENT_STRATEGIES.includes(rules.strategy as LeadAssignmentStrategy) &&
    Array.isArray(rules.cityOwners) &&
    rules.cityOwners.every(isCityOwner)
  );
}

export interface CleanedCityOwners {
  readonly kept: { readonly userId: string; readonly cities: readonly string[] }[];
  /** People left with no city: the save is refused so nobody vanishes unnoticed. */
  readonly blank: readonly string[];
  /** Already saved but no longer work on leads (deactivated, role changed): dropped. */
  readonly dropped: readonly string[];
  /** Newly added people who cannot work on leads: the save is refused. */
  readonly refused: readonly string[];
}

/**
 * City owners as they are saved: city names trimmed with blanks and repeats dropped.
 * Someone already saved who can no longer own leads is dropped (the screen says so);
 * someone new who cannot is refused, and so is anyone left with no city.
 */
export function cleanCityOwners(
  owners: LeadAssignmentRules['cityOwners'],
  canOwnLeads: ReadonlySet<string>,
  saved: ReadonlySet<string>,
): CleanedCityOwners {
  const kept: { userId: string; cities: string[] }[] = [];
  const blank: string[] = [];
  const dropped: string[] = [];
  const refused: string[] = [];
  for (const owner of owners) {
    if (!canOwnLeads.has(owner.userId)) {
      (saved.has(owner.userId) ? dropped : refused).push(owner.userId);
      continue;
    }
    const cities = [...new Set(owner.cities.map((city) => city.trim()).filter(Boolean))];
    if (cities.length === 0) blank.push(owner.userId);
    else kept.push({ userId: owner.userId, cities });
  }
  return { kept, blank, dropped, refused };
}
