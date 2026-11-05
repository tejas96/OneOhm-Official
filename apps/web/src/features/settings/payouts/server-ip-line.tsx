'use client';

import { Button } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** The server's public IP, for the allow-list in RazorpayX (live mode only). */
export function ServerIpLine({ ip }: { readonly ip: string }) {
  const t = useTranslations('settings.bankTransfers.serverIp');
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ip);
      setCopied('yes');
    } catch {
      setCopied('no');
    }
  };
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-sunken px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="type-body-sm text-ink">
          {t('label')} <span className="font-mono">{ip}</span>
        </p>
        <Button variant="quiet" size="sm" onClick={copy}>
          {copied === 'yes' ? t('copied') : t('copy')}
        </Button>
        {copied === 'no' && <span className="type-body-sm text-at-risk">{t('copyFailed')}</span>}
      </div>
      <p className="type-body-sm text-ink-muted">{t('hint')}</p>
    </div>
  );
}
