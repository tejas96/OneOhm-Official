'use client';

import type { Product } from '@oneohm/api-contracts';
import type { SearchOption } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';

/** Catalog names as people say them; the starter catalog has no real brand yet. */
export const catalogName = (product: Product) =>
  product.brand && product.brand !== 'Starter catalog'
    ? `${product.brand} ${product.name}`
    : product.name;

/**
 * Search options for catalog products: the name shown, SKU and brand found by search too,
 * and an optional second line (rating, DCR).
 */
export function productOptions(
  products: readonly Product[],
  describe?: (product: Product) => string | undefined,
): SearchOption<string>[] {
  return products.map((product) => {
    const description = describe?.(product);
    return {
      value: product.id,
      label: catalogName(product),
      ...(description ? { description } : {}),
      keywords: `${product.sku} ${product.brand}`,
    };
  });
}

/** The words every product search box uses. Spread them onto a SearchSelect. */
export function useSearchWords() {
  const t = useTranslations('productSearch');
  return {
    placeholder: t('choose'),
    searchPlaceholder: t('placeholder'),
    emptyText: t('empty'),
    moreText: t('more', { shown: '{shown}', total: '{total}' }),
  };
}
