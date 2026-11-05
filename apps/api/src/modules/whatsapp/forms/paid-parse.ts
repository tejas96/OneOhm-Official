/** The rupees typed in the form as paise ("1,200" → 120000); null when it is not a sensible amount. */
export function paiseFrom(typed: string | null): number | null {
  if (!typed) return null;
  const rupees = Number(typed.replace(/[,\s₹]/g, ''));
  if (!Number.isFinite(rupees) || rupees <= 0 || rupees > 100_000_00) return null;
  return Math.round(rupees * 100);
}

/**
 * The day picked as YYYY-MM-DD: the form posts the date as text, or (older Flow JSON) as
 * milliseconds. A day in the future or a nonsense value is null.
 */
export function dayFrom(picked: string | null, now = new Date()): string | null {
  if (!picked) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(picked)
    ? new Date(`${picked}T00:00:00Z`)
    : /^\d{10,13}$/.test(picked)
      ? new Date(Number(picked))
      : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const day = date.toISOString().slice(0, 10);
  return day > now.toISOString().slice(0, 10) ? null : day;
}
