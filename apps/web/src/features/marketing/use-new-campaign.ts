'use client';

import type { CampaignDefaults } from '@oneohm/api-contracts';
import type { CampaignChannel, CampaignGoal, MessageSegment } from '@oneohm/domain';
import { useState } from 'react';
import { type Draft, tidyChannels } from './compose-checks';

function startingDraft(defaults: CampaignDefaults): Draft {
  const goal = defaults.goal;
  return {
    goal,
    mediaId: null,
    mediaKind: null,
    uploading: false,
    text: '',
    channels: tidyChannels(goal, defaults.channels, null),
    segments: defaults.defaultSegments,
    city: defaults.city,
    budget:
      defaults.dailyBudgetPaise > 0 ? String(Math.round(defaults.dailyBudgetPaise / 100)) : '',
    when: 'now',
    date: '',
    time: '09:00',
  };
}

function toggled<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];
}

/** The New campaign form's state, with the rules that keep places and goal in step. */
export function useNewCampaign(defaults: CampaignDefaults) {
  const [draft, setDraft] = useState<Draft>(() => startingDraft(defaults));
  const patch = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }));
  return {
    draft,
    patch,
    setGoal: (goal: CampaignGoal) =>
      setDraft((current) => ({
        ...current,
        goal,
        channels: tidyChannels(goal, current.channels, current.mediaKind),
      })),
    toggleChannel: (channel: CampaignChannel) =>
      setDraft((current) => ({ ...current, channels: toggled(current.channels, channel) })),
    toggleSegment: (segment: MessageSegment) =>
      setDraft((current) => ({ ...current, segments: toggled(current.segments, segment) })),
    setMedia: (media: { id: string | null; kind: 'image' | 'video' | null }) =>
      setDraft((current) => ({
        ...current,
        mediaId: media.id,
        mediaKind: media.kind,
        channels: tidyChannels(current.goal, current.channels, media.kind),
      })),
  };
}

export type NewCampaignState = ReturnType<typeof useNewCampaign>;
