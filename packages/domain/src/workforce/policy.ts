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
  /** Day start and end, "HH:MM" in the business time zone: these are the business hours. */
  readonly dayStart: string;
  readonly dayEnd: string;
  /**
   * The lunch break inside the day ("HH:MM"); no visit time may overlap it. Both null = no
   * break. Edited with the working days in Settings → Working time & holidays.
   */
  readonly lunchStart: string | null;
  readonly lunchEnd: string | null;
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
  /** A field pin farther than this from the worker's check-in reading is flagged for the office, in metres. */
  readonly pinTrustM: number;
  /** The system makes the day's claim when the day closes (Duty Day step 2). */
  readonly autoClaim: boolean;
  /** A clean automatic claim is approved by the system the next morning; off until switched on. */
  readonly autoApprove: boolean;
  /** An automatic claim over this many km always waits for a person. */
  readonly autoApproveMaxKm: number;
  /** An automatic claim over this many paise always waits for a person. */
  readonly autoApproveMaxPaise: number;
  /** The paid route is cut to the straight-line distance between stops times this. */
  readonly routeCapRatio: number;
  /** The phone and the route check the person in and out at their sites by themselves (Duty Day step 3). */
  readonly autoSiteVisits: boolean;
  /** How close to a site, in metres, counts as being at it for automatic visits. */
  readonly siteFenceM: number;
  /** A duty start within this many km of the person's base or of an office is a known place. */
  readonly baseStartMaxKm: number;
  /** Km taken off each day's paid km once, after the cap (the part of the day that is commuting). */
  readonly commuteDeductKm: number;
}

export interface WorkforcePolicy {
  readonly leaveTypes: readonly LeaveType[];
  /** Days of the week off (0 = Sunday … 6 = Saturday); not counted as leave. The business's days off. */
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
    lunchStart: '13:00',
    lunchEnd: '14:00',
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
  travel: {
    farFromSiteM: 300,
    ratePaisePerKm: 500,
    hoursMarginMinutes: 60,
    pinTrustM: 100,
    autoClaim: true,
    autoApprove: false,
    autoApproveMaxKm: 150,
    autoApproveMaxPaise: 150_000,
    routeCapRatio: 1.6,
    autoSiteVisits: true,
    siteFenceM: 150,
    baseStartMaxKm: 5,
    commuteDeductKm: 0,
  },
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
