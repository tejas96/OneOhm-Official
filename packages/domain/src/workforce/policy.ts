/**
 * Leave, attendance and points rules (PRD 3.12, 4.3, 4.6, 4.7, 7.2). Owners edit them in
 * Settings; these are the starting values for a new install.
 */
export interface LeaveType {
  readonly key: string;
  readonly label: string;
  /** Days allowed per calendar year. */
  readonly daysPerYear: number;
}

export interface AttendancePolicy {
  /** Day start and end, "HH:MM" in India time. */
  readonly dayStart: string;
  readonly dayEnd: string;
  /** Minutes after the day start before a check-in counts as late. */
  readonly graceMinutes: number;
  /** Ask for the phone's location at check-in and check-out (with consent). */
  readonly captureLocation: boolean;
  /** Location readings are deleted after this many days. */
  readonly retentionDays: number;
  /** The first site check-in of the day also checks the person in (PRD 4.3). */
  readonly autoCheckInFromSite: boolean;
  /**
   * Location switched on or off for whole roles, by role key, over `captureLocation`.
   * A person's own setting (in Team) wins over these.
   */
  readonly trackingByRole: Readonly<Record<string, boolean>>;
}

export interface PointsPolicy {
  /**
   * A task handed in by its due date, after outside waits and leave are added (spec 3.7).
   * Late tasks earn nothing; nobody ever loses points.
   */
  readonly onTimeTask: number;
  /** A task with an approval step, approved without being sent back. */
  readonly firstTimeRight: number;
  /** Suggested for the project manager when a customer rates 4 or 5 stars. */
  readonly goodRating: number;
  /** Most a manager can give in one recognition. */
  readonly recognitionMax: number;
  /** Suggested for each person a customer names with 4 or 5 stars on a stage rating. */
  readonly stageRating: number;
}

/** Workload (PRD 3.12): open tasks one person should carry; 0 means no limit. */
export interface CapacityPolicy {
  readonly defaultOpenTaskLimit: number;
}

/** Site check-ins and travel reimbursement (PRD 4.2, 4.3). */
export interface SiteTravelPolicy {
  /** A site check-in farther than this from the saved site location is flagged, in metres. */
  readonly farFromSiteM: number;
  /** Paid per km of travel between the day's site visits, in paise. */
  readonly ratePaisePerKm: number;
  /** Minutes before the day starts and after it ends when location may still be read. */
  readonly hoursMarginMinutes: number;
}

export interface WorkforcePolicy {
  readonly leaveTypes: readonly LeaveType[];
  /** Days of the week off (0 = Sunday … 6 = Saturday); not counted as leave. */
  readonly weeklyOff: readonly number[];
  readonly attendance: AttendancePolicy;
  readonly points: PointsPolicy;
  readonly travel: SiteTravelPolicy;
  readonly capacity: CapacityPolicy;
}

export const DEFAULT_WORKFORCE_POLICY: WorkforcePolicy = {
  leaveTypes: [
    { key: 'casual', label: 'Casual leave', daysPerYear: 12 },
    { key: 'sick', label: 'Sick leave', daysPerYear: 6 },
  ],
  weeklyOff: [0],
  attendance: {
    dayStart: '09:30',
    dayEnd: '18:30',
    graceMinutes: 15,
    captureLocation: true,
    retentionDays: 90,
    autoCheckInFromSite: false,
    trackingByRole: {},
  },
  points: {
    onTimeTask: 10,
    firstTimeRight: 10,
    goodRating: 50,
    recognitionMax: 200,
    stageRating: 20,
  },
  travel: { farFromSiteM: 300, ratePaisePerKm: 500, hoursMarginMinutes: 60 },
  capacity: { defaultOpenTaskLimit: 0 },
};

/** A saved policy with any section added since it was saved filled from the defaults. */
export function withPolicyDefaults(
  saved: Partial<WorkforcePolicy> | null | undefined,
): WorkforcePolicy {
  if (!saved) return DEFAULT_WORKFORCE_POLICY;
  return {
    ...DEFAULT_WORKFORCE_POLICY,
    ...saved,
    attendance: { ...DEFAULT_WORKFORCE_POLICY.attendance, ...saved.attendance },
    points: { ...DEFAULT_WORKFORCE_POLICY.points, ...saved.points },
    travel: { ...DEFAULT_WORKFORCE_POLICY.travel, ...saved.travel },
    capacity: { ...DEFAULT_WORKFORCE_POLICY.capacity, ...saved.capacity },
  };
}
