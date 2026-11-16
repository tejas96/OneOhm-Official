/**
 * A path from "that tap was too old" to the correction sheet: the toast asks for a
 * correction for that day, and the attendance card on Today opens the sheet on it.
 */
type Listener = (date: string) => void;

const listeners = new Set<Listener>();
let pending: string | null = null;

export function requestCorrection(date: string): void {
  if (listeners.size === 0) pending = date;
  for (const listener of listeners) listener(date);
}

/** Listens for requests; one made before the card was on screen is delivered at once. */
export function onCorrectionRequest(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    const date = pending;
    pending = null;
    listener(date);
  }
  return () => {
    listeners.delete(listener);
  };
}
