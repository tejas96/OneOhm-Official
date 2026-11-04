'use client';

import { Button, Dialog, TabPanel, Tabs } from '@oneohm/design-system/web';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { StarterNotice } from '../starter-notice';
import { useRateCard } from '../use-settings';
import { JobTravelView } from './job-travel-view';
import { PricingRulesView } from './pricing-rules-view';
import { RateLinesView } from './rate-lines-view';
import { SiteTypesView } from './site-types-view';

const VIEWS = ['lines', 'sites', 'labour', 'rules'] as const;
type View = (typeof VIEWS)[number];

/**
 * Settings → Rates (PRD 3.9): the rate lines everything is priced from, what each kind of
 * site assumes until the survey measures it, labour and travel, and how cost becomes
 * price. The open part lives in `?view=`.
 */
export function RatesPanel() {
  const t = useTranslations('costing.settings');
  const settingsT = useTranslations('settings');
  const format = useFormatter();
  const card = useRateCard();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get('view');
  const view: View = VIEWS.find((value) => value === requested) ?? 'lines';
  // Only the open part is mounted: unsaved edits there are confirmed before switching.
  const [unsaved, setUnsaved] = useState(false);
  const [leavingTo, setLeavingTo] = useState<View | null>(null);

  const select = (next: View) => {
    if (next === view) return;
    if (unsaved) {
      setLeavingTo(next);
      return;
    }
    go(next);
  };
  const go = (next: View) => {
    setUnsaved(false);
    setLeavingTo(null);
    const query = new URLSearchParams(params);
    query.set('view', next);
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  };

  if (card.isPending) return <ListSkeleton label={t('loading')} rows={5} />;
  if (card.isError) return <LoadError error={card.error} onRetry={() => card.refetch()} />;
  const settings = card.data;

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      {settings.starter && <StarterNotice>{settingsT('starter.rates')}</StarterNotice>}
      <div className="flex flex-col gap-1">
        <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
        <p className="type-body-sm text-ink-faint">
          {settings.name} ·{' '}
          {t('lastSaved', {
            date: format.dateTime(new Date(settings.updatedAt), { dateStyle: 'medium' }),
          })}
        </p>
      </div>
      <Tabs
        value={view}
        onValueChange={select}
        label={t('viewsLabel')}
        items={VIEWS.map((value) => ({ value, label: t(`views.${value}`) }))}
      >
        <TabPanel value="lines" className="pt-6">
          <RateLinesView card={settings.rates} />
        </TabPanel>
        <TabPanel value="sites" className="pt-6">
          <SiteTypesView card={settings.rates} />
        </TabPanel>
        <TabPanel value="labour" className="pt-6">
          <JobTravelView card={settings.rates} onUnsaved={setUnsaved} />
        </TabPanel>
        <TabPanel value="rules" className="pt-6">
          <PricingRulesView card={settings.rates} onUnsaved={setUnsaved} />
        </TabPanel>
      </Tabs>
      <Dialog
        open={leavingTo !== null}
        onOpenChange={(next) => !next && setLeavingTo(null)}
        title={t('leaveTitle')}
        size="sm"
        footer={
          <>
            <Button variant="quiet" onClick={() => setLeavingTo(null)}>
              {t('stay')}
            </Button>
            <Button variant="danger" onClick={() => leavingTo && go(leavingTo)}>
              {t('leave')}
            </Button>
          </>
        }
      >
        <p className="type-body-sm text-ink-muted">{t('leaveBody')}</p>
      </Dialog>
    </div>
  );
}
