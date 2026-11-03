/** "1 lead" or "3 leads": `#` in the plural form stands for the count. */
export const plural = (count: number, one: string, many: string) =>
  count === 1 ? one : many.replace('#', String(count));
