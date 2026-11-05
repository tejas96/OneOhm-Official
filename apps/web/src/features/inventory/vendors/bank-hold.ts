/** True while a bank-change hold has not ended. */
export function holdActive(hold: { readonly until: string } | null, now = new Date()): boolean {
  return hold !== null && Date.parse(hold.until) > now.getTime();
}
