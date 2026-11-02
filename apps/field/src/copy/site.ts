/** English (India) copy for site check-ins, location status and travel claims. */
const distance = (metres: number) =>
  metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`;

const duration = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

export const TRACKING = {
  on: 'Location on during work',
  noConsent: 'Location off: not shared',
  policyOff: 'Location off for everyone',
  // Short enough for a phone pill; the working hours show on the card itself.
  outsideHours: 'Location off outside work hours',
  explainOn: 'Read only when you check in or out and when you take a site photo.',
} as const;

export const SITE = {
  title: 'At the site',
  kinds: {
    survey: 'Site survey',
    installation: 'Installation work',
    inspection: 'Inspection',
    service: 'Service visit',
  },
  checkIn: 'Check in at site',
  checkOut: 'Check out of site',
  finding: (metres: number | null) =>
    metres === null ? 'Finding your location…' : `Finding your location… ${Math.round(metres)} m`,
  inSince: (time: string) => `Checked in at ${time}`,
  visit: (from: string, to: string, minutes: number) => `${from} to ${to} · ${duration(minutes)}`,
  fromSite: (metres: number) => `${distance(metres)} from the site`,
  far: (metres: number) => `${distance(metres)} from the saved site. Your manager sees this flag.`,
  farBadge: 'Far from site',
  notShared: 'Location not shared',
  siteUnknown: 'This site has no saved location yet.',
  saveSite: 'Save this spot as the site location',
  siteSaved: 'Site location saved.',
  pinRoof: 'Pin the roof',
  movePin: 'Move the roof pin',
  pinNeedsLocation: 'Share your location to pin the roof.',
  pinned: 'Roof pinned',
  pinnedFlagged: 'Roof pinned. The office will check it.',
  pinWaiting: 'Roof pin waiting for signal',
  navigate: 'Navigate',
  elsewhere: (task: string) => `You are checked in for ${task}. Check out there first.`,
  checkedIn: 'Checked in at the site.',
  checkedOut: 'Checked out of the site.',
  past: 'Earlier visits',
  noFix: 'Your location could not be read. The visit is saved without it.',
  denied: 'Location is off for OneOhm. The visit is saved without it.',
  done: 'This task is complete.',
} as const;

/** The satellite map for pinning the roof. */
export const PIN = {
  title: 'Pin the roof',
  hint: 'Move the map so the pin sits on the roof.',
  close: 'Close the map',
  loading: 'Loading the map…',
  saved: 'Saved site location',
  confirm: 'This is the roof',
  useGps: 'Use my GPS reading',
  failed: 'Map not loading. Use my GPS reading',
} as const;

export const TRAVEL = {
  link: 'Travel and claims',
  title: 'Travel',
  overline: 'SITE VISITS',
  loading: 'Loading your travel',
  days: { today: 'Today', yesterday: 'Yesterday' },
  pickDay: 'Day',
  route: 'Route',
  routeHint: 'Straight-line distance between stops, not road distance.',
  unpaidLeg: 'No location at one end, not paid',
  total: (metres: number, rate: string, amount: string) =>
    `${distance(metres)} at ${rate}/km = ${amount}`,
  noVisits: 'No site check-ins on this day.',
  unlocated: (count: number) =>
    count === 1
      ? '1 visit had no location, so its legs are not paid.'
      : `${count} visits had no location, so their legs are not paid.`,
  note: 'Note for your manager',
  noteHint: 'For example: two trips to the same site.',
  project: 'Project',
  projectHint: 'The travel counts in this project’s cost.',
  noProject: 'None',
  forProject: (code: string) => `For ${code}`,
  claimedFor: (amount: string, metres: number) => `Claimed ${amount} for ${distance(metres)}`,
  claim: 'Claim reimbursement',
  claimed: 'Claim sent for approval.',
  cancel: 'Cancel claim',
  cancelled: 'Claim cancelled.',
  nothingToClaim: 'Nothing to claim on this day.',
  mine: 'Your claims',
  noClaims: 'Claims you make show here.',
  status: {
    pending: 'Waiting for approval',
    approved: 'Approved, payment due',
    paid: 'Paid',
    rejected: 'Declined',
    cancelled: 'Cancelled',
  },
  decisionNote: (note: string) => `Note: ${note}`,
  distance,
} as const;
