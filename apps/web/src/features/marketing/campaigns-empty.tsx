'use client';

import { Button, EmptyState, Illustration } from '@oneohm/design-system/web';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** No campaigns yet: warm, and one clear thing to do. */
export function CampaignsEmpty({
  metaConnected,
  onNew,
  onConnections,
}: {
  readonly metaConnected: boolean;
  readonly onNew: () => void;
  readonly onConnections: () => void;
}) {
  const t = useTranslations('marketing');
  return (
    <EmptyState
      illustration={<Illustration name="reward" size={132} />}
      title={t('empty.title')}
      description={t('empty.body')}
      action={
        <div className="flex flex-col items-center gap-3">
          <Button variant="primary" size="lg" leadingIcon={<Plus />} onClick={onNew}>
            {t('newCampaign')}
          </Button>
          {!metaConnected && (
            <Button variant="quiet" size="sm" onClick={onConnections}>
              {t('empty.connectFirst')}
            </Button>
          )}
        </div>
      }
    />
  );
}
