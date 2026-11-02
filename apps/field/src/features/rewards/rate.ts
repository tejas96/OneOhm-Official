/** A share of judged tasks as a whole percent; a dash when nothing was judged. */
export const ratePercent = (rate: number | null) =>
  rate === null ? '–' : `${Math.round(rate * 100)}%`;
