/** Shared checks for Settings forms: problems by field, empty when it can be saved. */
export type SettingErrors = Record<string, string>;

/** Adds an error unless `value` is a whole number from `min` to `max`. */
export function checkWhole(
  errors: SettingErrors,
  field: string,
  value: number,
  min: number,
  max: number,
  unit = 'days',
): void {
  if (!Number.isInteger(value) || value < min || value > max)
    errors[field] = `Use a whole number of ${unit} from ${min} to ${max}.`;
}

/** "HH:MM" on a 24-hour clock. */
export function isClockTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  return Number(match[1]) < 24 && Number(match[2]) < 60;
}

/** Adds an error unless `value` is an "HH:MM" time. */
export function checkTime(errors: SettingErrors, field: string, value: string): void {
  if (!isClockTime(value)) errors[field] = 'Pick a time, like 08:30.';
}

/** Saved values over the defaults: keys the saved copy lacks (older saves) keep the default. */
export function withDefaults<T extends object>(defaults: T, saved: unknown): T {
  if (!saved || typeof saved !== 'object') return defaults;
  const base = defaults as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base)) {
    const value = (saved as Record<string, unknown>)[key];
    if (value !== undefined && typeof value === typeof base[key]) merged[key] = value;
  }
  return merged as T;
}
