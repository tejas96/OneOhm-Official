'use client';

import type { DocumentRecord } from '@oneohm/api-contracts';
import { Badge, listItemEnter } from '@oneohm/design-system/web';
import { Check, FileCheck, ListChecks, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { folderOf, titleOf } from './document-kinds';
import { DocumentTile } from './document-tile';
import { useAddedLine, useFolderLabel, useKindAndSize } from './use-labels';

function SourceBadge({ document }: { readonly document: DocumentRecord }) {
  const t = useTranslations('documents.gallery.badges');
  if (document.source === 'upload') return null;
  const Icon = document.source === 'report' ? FileCheck : Sparkles;
  return (
    <Badge variant="soft" className="absolute top-2 left-2 bg-raised/95 shadow-e1">
      <Icon aria-hidden className="size-3" />
      {t(document.source)}
    </Badge>
  );
}

/** One document in the gallery: preview, title, type and size, who added it and when. */
export function DocumentCard({
  document,
  index,
  showProject,
  onOpen,
  selected,
  onToggle,
}: {
  readonly document: DocumentRecord;
  readonly index: number;
  /** Customer galleries span projects, so each card names its project. */
  readonly showProject: boolean;
  readonly onOpen: (document: DocumentRecord) => void;
  /** In select mode a tap picks the file instead of opening it. */
  readonly selected?: boolean | undefined;
  readonly onToggle?: ((document: DocumentRecord) => void) | undefined;
}) {
  const t = useTranslations('documents.gallery.card');
  const added = useAddedLine();
  const kindAndSize = useKindAndSize();
  const folderLabel = useFolderLabel();
  const context = [showProject ? document.projectCode : null, document.taskTitle].filter(Boolean);
  return (
    <motion.li {...listItemEnter(index)} className="min-w-0">
      <button
        type="button"
        onClick={() => (onToggle ? onToggle(document) : onOpen(document))}
        aria-pressed={onToggle ? Boolean(selected) : undefined}
        className={`${selected ? 'border-accent ring-2 ring-accent/40 ' : ''}group flex h-full w-full flex-col overflow-hidden rounded-lg border border-hairline bg-raised text-left transition-[box-shadow,border-color] duration-(--duration-fast) hover:border-rule hover:shadow-e2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
      >
        <span className="relative block aspect-[4/3] overflow-hidden border-b border-hairline">
          <DocumentTile
            document={document}
            className="transition-transform duration-(--duration-slow) group-hover:scale-[1.02]"
          />
          <SourceBadge document={document} />
          {onToggle && (
            <span
              aria-hidden
              className={`absolute top-2 right-2 flex size-6 items-center justify-center rounded-full border-2 ${selected ? 'border-accent bg-accent text-on-accent' : 'border-white/90 bg-black/20'}`}
            >
              {selected && <Check className="size-3.5" />}
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1 p-3">
          <span className="line-clamp-2 break-words type-body-sm font-medium text-ink">
            {titleOf(document.name)}
          </span>
          <span className="truncate type-body-sm text-ink-faint">{kindAndSize(document)}</span>
          <span className="truncate type-body-sm text-ink-faint">{added(document)}</span>
          {context.length > 0 && (
            <span className="mt-auto pt-1.5">
              <span className="flex min-w-0 items-center gap-1.5 border-t border-hairline pt-2 type-label text-ink-muted">
                <ListChecks aria-hidden className="size-3.5 shrink-0 text-ink-faint" />
                <span className="truncate">{context.join(' · ')}</span>
              </span>
            </span>
          )}
          <span className="sr-only">{t('filed', { folder: folderLabel(folderOf(document)) })}</span>
        </span>
      </button>
    </motion.li>
  );
}
