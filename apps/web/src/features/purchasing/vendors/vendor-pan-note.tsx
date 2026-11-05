import type { Vendor } from '@oneohm/api-contracts';
import { vendorPan } from '@oneohm/domain';
import { useTranslations } from 'next-intl';

/** A calm note when TDS cannot follow the normal rate because no PAN is known. */
export function VendorPanNote({ vendor }: { readonly vendor: Vendor }) {
  const t = useTranslations('purchasing.profile');
  if (vendorPan(vendor.pan, vendor.gstin)) return null;
  return (
    <p className="rounded-2xl bg-sunken px-4 py-3 type-body-sm text-ink-muted">{t('noPan')}</p>
  );
}
