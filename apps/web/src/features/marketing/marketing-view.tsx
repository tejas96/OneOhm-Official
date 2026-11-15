'use client';

import {
  Button,
  PageHeader,
  pageEnter,
  SegmentedControl,
  Skeleton,
  SkeletonGroup,
} from '@oneohm/design-system/web';
import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { BlockedPage, LoadError } from '@/components/query-state';
import { useCan } from '@/providers/current-user';
import { CampaignDetailSheet } from './campaign-detail-sheet';
import { CampaignsHome } from './campaigns-home';
import { ConnectionChips } from './connection-chips';
import { ConnectionsTab } from './connections-tab';
import { NewCampaignSheet } from './new-campaign-sheet';
import { useMarketingOverview } from './use-marketing';
import { useMarketingUrl } from './use-marketing-url';

function HomeSkeleton({ label }: { readonly label: string }) {
  return (
    <SkeletonGroup label={label} className="flex flex-col gap-4">
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
      </div>
    </SkeletonGroup>
  );
}

/** Marketing for people who are not marketers: run a campaign, see what it brought, connect. */
export function MarketingView() {
  const t = useTranslations('marketing');
  if (!useCan('marketing.manage')) return <BlockedPage title={t('title')} />;
  return <MarketingContent />;
}

function MarketingContent() {
  const t = useTranslations('marketing');
  const url = useMarketingUrl();
  const overview = useMarketingOverview();
  const goConnections = () => url.setTab('connections');
  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 py-2">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <>
            {overview.data && (
              <ConnectionChips connections={overview.data.connections} onOpen={goConnections} />
            )}
            <Button variant="primary" leadingIcon={<Plus />} onClick={() => url.setNew(true)}>
              {t('newCampaign')}
            </Button>
          </>
        }
      />
      <SegmentedControl
        label={t('tabs.label')}
        value={url.tab}
        onValueChange={url.setTab}
        options={[
          { value: 'campaigns', label: t('tabs.campaigns') },
          { value: 'connections', label: t('tabs.connections') },
        ]}
        className="self-start"
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={url.tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {url.tab === 'connections' ? (
            <ConnectionsTab url={url} />
          ) : overview.isPending ? (
            <HomeSkeleton label={t('loading')} />
          ) : overview.isError ? (
            <LoadError error={overview.error} onRetry={() => overview.refetch()} />
          ) : (
            <CampaignsHome
              overview={overview.data}
              onNew={() => url.setNew(true)}
              onConnections={goConnections}
              onCampaign={url.setCampaign}
            />
          )}
        </motion.div>
      </AnimatePresence>
      <NewCampaignSheet
        open={url.newCampaign}
        onClose={() => url.setNew(false)}
        onOpenCampaign={url.showMade}
      />
      <CampaignDetailSheet id={url.campaignId} onClose={() => url.setCampaign(null)} />
    </motion.div>
  );
}
