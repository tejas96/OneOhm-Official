/** English (India) copy for attendance, leave and points in the field app. */
const days = (halves: number) => {
  const value = halves / 2;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${value === 1 ? 'day' : 'days'}`;
};

export const ATTENDANCE = {
  title: 'Attendance',
  notIn: 'You have not checked in yet.',
  checkIn: 'Check in',
  checkOut: 'Check out',
  checkingIn: 'Checking in',
  inAt: (time: string) => `In at ${time}`,
  outAt: (time: string) => `Out at ${time}`,
  late: 'Late',
  corrected: 'Corrected',
  dayDone: 'Done for today.',
  hours: (start: string, end: string) => `Working day ${start} to ${end}`,
  at: (place: string, inside: boolean, metres: number) =>
    inside ? `At ${place}` : `${metres} m from ${place}`,
  noPlace: 'Location not shared',
  correction: 'Wrong time? Ask for a correction',
  consentTitle: 'Share your location during work?',
  /**
   * The consent words, version 2 (LOCATION_CONSENT_VERSION in @oneohm/domain). Change
   * them only together with that version, so everyone is asked again.
   */
  consentBody: (days: number) =>
    `OneOhm reads where you are only when you check in or out (for the day or at a customer's site) and when you take a site photo, and only during working hours. It confirms attendance and site visits and works out your travel. Nothing is tracked in between or after work, and the location is deleted after ${days} days.`,
  allow: 'Share during work',
  notNow: 'Not now',
  locationTitle: 'Location during work',
  sharing: 'Location shared at check-ins and site photos',
  notSharing: 'Location not shared. You can still check in.',
  stopSharing: 'Stop sharing',
  noFix: 'Your location could not be read. You are checked in without it.',
  permissionDenied: 'Location is off for OneOhm. You are checked in without it.',
} as const;

export const CORRECTION = {
  title: 'Ask for a correction',
  description: 'Say what the times should be. Your manager approves it.',
  checkIn: 'Check-in time',
  checkOut: 'Check-out time',
  timeHint: 'As HH:MM, for example 09:25',
  reason: 'What happened?',
  reasonHint: 'For example: phone battery died at the site.',
  send: 'Send for approval',
  sent: 'Sent for approval.',
  badTime: 'Use HH:MM, for example 09:25.',
} as const;

export const LEAVE = {
  tab: 'Leave',
  overline: 'TIME OFF',
  title: 'Leave',
  loading: 'Loading your leave',
  left: (halves: number) => days(halves),
  daysLeft: 'left',
  usedPending: (used: number, pending: number) =>
    pending > 0 ? `${days(used)} used · ${days(pending)} waiting` : `${days(used)} used`,
  request: 'Request leave',
  emptyTitle: 'No leave planned',
  emptyBody: 'Requests and approved leave show here.',
  cancel: 'Cancel request',
  cancelled: 'Request cancelled.',
  status: {
    pending: 'Waiting for approval',
    approved: 'Approved',
    rejected: 'Declined',
    cancelled: 'Cancelled',
  },
  days,
  handedOver: (count: number) =>
    count === 1 ? '1 task handed to your backup' : `${count} tasks handed to your backup`,
  emergencyBadge: 'Emergency',
} as const;

export const REQUEST_LEAVE = {
  pickDays: 'Pick the days first.',
  title: 'Request leave',
  kind: 'Kind of leave',
  from: 'First day',
  to: 'Last day',
  halfDay: 'Half day',
  fullDay: 'Full day',
  length: 'How long',
  emergency: 'Emergency leave',
  requestKind: 'Planned or emergency',
  planned: 'Planned',
  emergencyShort: 'Emergency',
  emergencyHint: 'Already away, or more than your balance. HR settles it.',
  reason: 'Reason',
  impactTitle: 'What this leave means',
  counted: (halves: number) => `${days(halves)} of leave`,
  after: (halves: number) =>
    halves < 0 ? `${days(-halves)} over your balance` : `${days(halves)} left after this`,
  overlap: 'You already have leave on some of these days.',
  workTitle: 'WORK DUE DURING THIS TIME',
  noWork: 'Nothing of yours is due in these days.',
  dueOn: (project: string, date: string) => `${project} · due ${date}`,
  backupTitle: 'WHO COULD COVER IT',
  backupHint: 'Your manager sees this. Tasks move to them only when the leave is approved.',
  openTasks: (count: number) => (count === 1 ? '1 open task' : `${count} open tasks`),
  noBackup: 'No one shares this work right now. Your manager will arrange cover.',
  handover: 'Handover note',
  handoverHint: 'Where things are, who to call, what is pending.',
  send: 'Send request',
  sent: 'Leave requested. You will hear when it is decided.',
  checking: 'Checking',
} as const;
