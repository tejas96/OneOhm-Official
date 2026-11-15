'use client';

import { Button, useToast } from '@oneohm/design-system/web';
import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** A line of text with a Copy button; says "Copied" for a moment. */
export function CopyLine({ label, value }: { readonly label: string; readonly value: string }) {
  const t = useTranslations('marketing');
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => toast({ title: t('copyFailed'), tone: 'error' }));
  };
  return (
    <div className="flex flex-col gap-1.5">
      <p className="type-label text-ink-muted">{label}</p>
      <div className="flex items-center gap-2 rounded-lg border border-hairline bg-sunken/60 py-1.5 pr-1.5 pl-3">
        <span className="min-w-0 flex-1 truncate type-body text-ink">{value}</span>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={copied ? <Check /> : <Copy />}
          onClick={copy}
        >
          {copied ? t('copied') : t('copy')}
        </Button>
      </div>
    </div>
  );
}
