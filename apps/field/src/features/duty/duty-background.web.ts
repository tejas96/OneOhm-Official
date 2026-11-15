/** Nothing records on the web: there is no background task there. */
export async function backgroundRunning(): Promise<boolean> {
  return false;
}
export async function startBackground(): Promise<void> {
  // Not on the web.
}
export async function stopBackground(): Promise<void> {
  // Not on the web.
}
