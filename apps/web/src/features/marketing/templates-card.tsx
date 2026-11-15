'use client';

import type { MarketingTemplate } from '@oneohm/api-contracts';
import { Button, Card, StatusPill } from '@oneohm/design-system/web';
import { MARKETING_MESSAGE_TEMPLATES } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { useBrandName } from '@/features/shell/company-name';
import { samplePreview } from './marketing-words';
import { useConnectionActions } from './use-connection-actions';

const TONE = {
  approved: 'onTrack',
  pending: 'review',
  rejected: 'overdue',
  not_sent: 'neutral',
  unknown: 'neutral',
} as const satisfies Record<MarketingTemplate['approval'], string>;

/** The WhatsApp messages a campaign can send, and where Meta's approval stands for each. */
export function TemplatesCard({
  ready,
  templates,
}: {
  readonly ready: boolean;
  readonly templates: readonly MarketingTemplate[];
}) {
  const t = useTranslations('marketing');
  const { submitTemplate } = useConnectionActions();
  const brand = useBrandName();
  // The wording with sample values, so the owner reads the real message, not {{1}}.
  const words = (template: MarketingTemplate) => {
    const known = MARKETING_MESSAGE_TEMPLATES.find((item) => item.key === template.key);
    return known ? samplePreview(template.preview, known.fields, brand) : template.preview;
  };
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="type-title-md text-ink">{t('templates.title')}</h2>
        <p className="type-body-sm text-ink-muted">
          {ready ? t('templates.intro') : t('templates.notReady')}
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-hairline">
        {templates.map((template) => (
          <li key={template.key} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
            <p className="type-body text-ink">{words(template)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                tone={TONE[template.approval]}
                size="sm"
                label={t(`templates.state.${template.approval}`)}
              />
              {(template.approval === 'not_sent' || template.approval === 'rejected') && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!ready}
                  pending={submitTemplate.isPending && submitTemplate.variables === template.key}
                  onClick={() => submitTemplate.mutate(template.key)}
                >
                  {t('templates.send')}
                </Button>
              )}
            </div>
            {template.approval === 'rejected' && template.rejectedReason && (
              <p className="type-body-sm text-overdue">
                {t('templates.rejected', { reason: template.rejectedReason })}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
