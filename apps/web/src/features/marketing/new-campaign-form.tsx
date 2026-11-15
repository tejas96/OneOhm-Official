'use client';

import type { CampaignDefaults } from '@oneohm/api-contracts';
import { Field, Textarea } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { AdPreview } from './ad-preview';
import { BudgetCity } from './budget-city';
import { needsBudget } from './compose-checks';
import { GoalTiles } from './goal-tiles';
import { MediaDrop } from './media-drop';
import { PlacesPicker } from './places-picker';
import { useMarketingConnections } from './use-marketing';
import type { NewCampaignState } from './use-new-campaign';
import { WhenPicker } from './when-picker';

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="type-title-md text-ink">{title}</h3>
      {children}
    </section>
  );
}

/** The whole New campaign screen: goal, photo, words with a live preview, places, city, money. */
export function NewCampaignForm({
  defaults,
  state,
}: {
  readonly defaults: CampaignDefaults;
  readonly state: NewCampaignState;
}) {
  const t = useTranslations('marketing');
  const connections = useMarketingConnections();
  const { draft, patch } = state;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const pageName =
    connections.data?.meta.extra?.split(' · ')[0] ??
    connections.data?.meta.accountName ??
    t('preview.yourPage');
  return (
    <div className="flex flex-col gap-7 p-5 sm:p-6">
      <Section title={t('goal.title')}>
        <GoalTiles value={draft.goal} onChange={state.setGoal} />
      </Section>
      <Section title={t('media.section')}>
        <MediaDrop
          onUploading={(uploading) => patch({ uploading })}
          onChange={(media) => state.setMedia(media)}
          onPreview={setPreviewUrl}
        />
      </Section>
      <Section title={t('text.section')}>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_19rem]">
          <Field label={t('text.label')} hint={t('text.hint')}>
            <Textarea
              rows={6}
              value={draft.text}
              maxLength={2000}
              placeholder={t('text.placeholder')}
              onChange={(event) => patch({ text: event.target.value })}
            />
          </Field>
          <AdPreview
            pageName={pageName}
            goal={draft.goal}
            text={draft.text}
            previewUrl={previewUrl}
            mediaKind={draft.mediaKind}
          />
        </div>
      </Section>
      <Section title={t('places.title')}>
        <PlacesPicker
          defaults={defaults}
          draft={draft}
          onToggle={state.toggleChannel}
          onSegment={state.toggleSegment}
        />
      </Section>
      {draft.goal === 'post' ? (
        <Section title={t('when.title')}>
          <WhenPicker draft={draft} onChange={patch} />
        </Section>
      ) : (
        <Section title={t('money.title')}>
          <BudgetCity
            draft={draft}
            cities={defaults.cities}
            showBudget={needsBudget(draft)}
            onCity={(city) => patch({ city })}
            onBudget={(budget) => patch({ budget })}
          />
        </Section>
      )}
    </div>
  );
}
