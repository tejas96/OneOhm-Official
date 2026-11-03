/**
 * The button while a site check-in or check-out runs. During the location read the
 * progress label shows (the shared Button hides its label when pending); once the read is
 * done and the request is sent, the spinner shows as usual.
 */
export function buttonState(
  isPending: boolean,
  progress: string | null,
  idle: string,
): { label: string; pending: boolean; disabled: boolean } {
  if (progress) return { label: progress, pending: false, disabled: true };
  return { label: idle, pending: isPending, disabled: false };
}
