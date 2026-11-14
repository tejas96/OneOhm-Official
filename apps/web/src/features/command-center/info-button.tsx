'use client';

import { cn, IconButton, Sheet } from '@oneohm/design-system/web';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { HelpBody, type HelpCard } from './help-body';

/** A small "i" that opens a plain-English guide to one command centre card. */
export function InfoButton({
  card,
  className,
}: {
  readonly card: HelpCard;
  readonly className?: string;
}) {
  const t = useTranslations(`commandCenter.help.${card}`);
  const ui = useTranslations('commandCenter.help.ui');
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        label={ui('open', { title: t('title') })}
        size="sm"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cn('size-7 shrink-0 pointer-coarse:size-9 [&_svg]:size-4', className)}
      >
        <Info aria-hidden />
      </IconButton>
      <Sheet open={open} onOpenChange={setOpen} title={t('title')} description={t('what')}>
        <HelpBody card={card} />
      </Sheet>
    </>
  );
}
