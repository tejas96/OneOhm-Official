'use client';

import type { ProjectMaterial } from '@oneohm/api-contracts';
import { Button } from '@oneohm/design-system/web';
import { ClipboardPlus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCan } from '@/providers/current-user';

/**
 * On a project's material card: people who cannot raise a purchase order themselves
 * ask procurement for what is still to order.
 */
export function RequestMaterialBar({
  projectId,
  stage,
}: {
  readonly projectId: string;
  readonly stage: ProjectMaterial['stage'];
}) {
  const t = useTranslations('purchasing.requests');
  const canBuy = useCan('procurement.manage');
  const canRequest = useCan('inventory.view', 'inventory.manage', 'projects.manage');
  if (canBuy || !canRequest || stage !== 'to_order') return null;
  return (
    <div className="flex flex-wrap gap-2 border-t border-hairline px-5 py-3">
      <Button asChild size="sm" variant="secondary" leadingIcon={<ClipboardPlus />}>
        <Link href={`/inventory?tab=requests&raise=1&projectId=${projectId}`}>{t('new')}</Link>
      </Button>
    </div>
  );
}
