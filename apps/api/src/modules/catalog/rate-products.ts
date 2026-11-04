interface LinkedLine {
  readonly label: string;
  readonly productId: string | null;
}

/**
 * A rate line linked to a product sells at that product's catalog price, so the product
 * must be in the catalog and in use. Returns the first line that breaks this.
 */
export function rateProductProblem(
  lines: readonly LinkedLine[],
  found: readonly { readonly id: string; readonly active: boolean }[],
): { readonly index: number; readonly archived: boolean } | null {
  const byId = new Map(found.map((product) => [product.id, product]));
  const index = lines.findIndex(
    (line) => line.productId !== null && byId.get(line.productId)?.active !== true,
  );
  if (index < 0) return null;
  const productId = lines[index]?.productId;
  return { index, archived: productId ? byId.has(productId) : false };
}

/** The rate lines that sell a product: it cannot be archived while any do. */
export function rateLinesUsing(lines: readonly LinkedLine[], productId: string): string[] {
  return lines.filter((line) => line.productId === productId).map((line) => line.label);
}
