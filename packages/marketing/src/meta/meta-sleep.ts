export type Sleep = (ms: number) => Promise<void>;

/** Real waiting; tests pass an instant one. */
export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export interface MetaOptions {
  readonly sleep?: Sleep;
}
