'use client';

import { Input, SegmentedControl } from '@oneohm/design-system/web';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DocumentKind, KindFilter } from './document-kinds';

const KIND_ORDER: readonly DocumentKind[] = ['image', 'pdf', 'media', 'other'];
/** Images and PDFs always show; voice and video, and others, only when there are some. */
const ALWAYS: ReadonlySet<DocumentKind> = new Set(['image', 'pdf']);

/** Search by title or file name, and the type chips (rarer kinds only when there are any). */
export function GalleryToolbar({
  search,
  onSearchChange,
  kind,
  onKindChange,
  kinds,
}: {
  readonly search: string;
  readonly onSearchChange: (search: string) => void;
  readonly kind: KindFilter;
  readonly onKindChange: (kind: KindFilter) => void;
  /** Kinds present in the scope; Images and PDFs always show. */
  readonly kinds: ReadonlySet<DocumentKind>;
}) {
  const t = useTranslations('documents.gallery');
  const options = [
    { value: 'all' as const, label: t('kinds.all') },
    ...KIND_ORDER.filter((value) => ALWAYS.has(value) || kinds.has(value) || kind === value).map(
      (value) => ({ value, label: t(`kinds.${value}`) }),
    ),
  ];
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1 lg:max-w-sm">
        <Input
          type="search"
          aria-label={t('searchLabel')}
          placeholder={t('search')}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          leading={<Search aria-hidden />}
        />
      </div>
      <SegmentedControl
        label={t('kind')}
        size="sm"
        value={kind}
        onValueChange={onKindChange}
        options={options}
        className="self-start"
      />
    </div>
  );
}
