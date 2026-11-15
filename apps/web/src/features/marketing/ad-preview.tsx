'use client';

import { Avatar } from '@oneohm/design-system/web';
import type { CampaignGoal } from '@oneohm/domain';
import { bodyOf, headlineOf } from '@oneohm/domain';
import { Heart, MessageCircle, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { previewButton } from './marketing-words';

/**
 * How the ad will look, updating as the person types: an Instagram-style card with the page
 * name, the photo, the words and the button (none for a plain post).
 */
export function AdPreview({
  pageName,
  goal,
  text,
  previewUrl,
  mediaKind,
}: {
  readonly pageName: string;
  readonly goal: CampaignGoal;
  readonly text: string;
  readonly previewUrl: string | null;
  readonly mediaKind: 'image' | 'video' | null;
}) {
  const t = useTranslations('marketing');
  const button = previewButton(goal);
  const headline = headlineOf(text);
  const body = bodyOf(text);
  return (
    <figure
      aria-label={t('preview.label')}
      className="mx-auto flex w-full max-w-[19rem] flex-col overflow-hidden rounded-xl border border-hairline bg-raised shadow-e2"
    >
      <figcaption className="flex items-center gap-2 px-3 py-2.5">
        <Avatar name={pageName} size="sm" />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate type-body-sm font-medium text-ink">{pageName}</span>
          <span className="type-body-sm text-ink-faint">{t('preview.sponsored')}</span>
        </span>
      </figcaption>
      <div className="flex aspect-square items-center justify-center bg-sunken text-ink-faint">
        {previewUrl && mediaKind === 'image' ? (
          // biome-ignore lint/performance/noImgElement: a local preview of the picked file
          <img src={previewUrl} alt="" className="size-full object-cover" />
        ) : previewUrl && mediaKind === 'video' ? (
          <video src={previewUrl} muted playsInline className="size-full object-cover" />
        ) : (
          <span className="type-body-sm">{t('preview.photoHere')}</span>
        )}
      </div>
      {button && (
        <div className="flex items-center justify-between gap-2 bg-accent-soft px-3 py-2">
          <span className="min-w-0 truncate type-body-sm font-medium text-on-accent-soft">
            {headline || t('preview.headlineHere')}
          </span>
          <span className="shrink-0 rounded-md bg-accent px-2.5 py-1 type-body-sm font-medium text-on-accent">
            {t(`preview.button.${button}`)}
          </span>
        </div>
      )}
      <div className="flex items-center gap-3 px-3 pt-2.5 text-ink [&_svg]:size-5">
        <Heart aria-hidden />
        <MessageCircle aria-hidden />
        <Send aria-hidden />
      </div>
      <p className="px-3 pt-1.5 pb-3 type-body-sm text-ink">
        <span className="font-medium">{pageName} </span>
        {body ? (
          <span className="whitespace-pre-line text-ink-muted">{body}</span>
        ) : (
          <span className="text-ink-faint">{t('preview.textHere')}</span>
        )}
      </p>
    </figure>
  );
}
