/** Field messages from the checks made before sending, keyed like the server's. */
export type Checks = Readonly<Record<string, string>>;

/** The checks without the given fields, once the person has changed them. */
export function withoutKeys(checks: Checks, ...keys: readonly string[]): Checks {
  if (!keys.some((key) => key in checks)) return checks;
  const rest: Record<string, string> = {};
  for (const [key, message] of Object.entries(checks)) {
    if (!keys.includes(key)) rest[key] = message;
  }
  return rest;
}

/** True when nothing is wrong. */
export function passes(checks: Checks): boolean {
  return Object.keys(checks).length === 0;
}

/** A 10-digit Indian mobile number, with or without spaces, dashes or +91. */
export function isIndianMobile(text: string): boolean {
  const digits = text.replace(/[\s-]/g, '').replace(/^\+91/, '');
  return /^[6-9]\d{9}$/.test(digits);
}
