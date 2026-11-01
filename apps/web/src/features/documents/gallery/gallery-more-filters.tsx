'use client';

import { Button, Input, Select } from '@oneohm/design-system/web';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { hasMoreFilters, type MoreFilters, type SourceFilter } from './gallery-filters';

const SOURCES: readonly SourceFilter[] = ['all', 'upload', 'system', 'report'];

/**
 * Narrow the files by where they came from, who added them and when (PRD 3.14). Four
 * small controls under the search; two to a row on a phone.
 */
export function GalleryMoreFilters({
  value,
  onChange,
  uploaders,
}: {
  readonly value: MoreFilters;
  readonly onChange: (patch: Partial<MoreFilters>) => void;
  /** Everyone who added a file in this list. */
  readonly uploaders: readonly { readonly id: string; readonly fullName: string }[];
}) {
  const t = useTranslations('documents.gallery.more');
  const fromId = useId();
  const toId = useId();
  const people = [
    { value: 'all', label: t('anyone') },
    ...uploaders.map((person) => ({ value: person.id, label: person.fullName })),
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <Select<SourceFilter>
        label={t('source')}
        value={value.source}
        onValueChange={(source) => onChange({ source })}
        options={SOURCES.map((source) => ({ value: source, label: t(`sources.${source}`) }))}
        className="h-9 min-w-0 type-body-sm sm:w-44"
      />
      <Select
        label={t('uploader')}
        value={value.uploader}
        onValueChange={(uploader) => onChange({ uploader })}
        options={people}
        className="h-9 min-w-0 type-body-sm sm:w-44"
      />
      <span className="flex min-w-0 items-center gap-2 type-body-sm text-ink-muted">
        <label htmlFor={fromId} className="shrink-0">
          {t('from')}
        </label>
        <Input
          id={fromId}
          type="date"
          value={value.from}
          max={value.to || undefined}
          onChange={(event) => onChange({ from: event.target.value })}
          className="h-9 min-w-0 type-body-sm"
        />
      </span>
      <span className="flex min-w-0 items-center gap-2 type-body-sm text-ink-muted">
        <label htmlFor={toId} className="shrink-0">
          {t('to')}
        </label>
        <Input
          id={toId}
          type="date"
          value={value.to}
          min={value.from || undefined}
          onChange={(event) => onChange({ to: event.target.value })}
          className="h-9 min-w-0 type-body-sm"
        />
      </span>
      {hasMoreFilters(value) && (
        <Button
          size="sm"
          variant="quiet"
          leadingIcon={<X aria-hidden />}
          className="col-span-2 justify-self-start"
          onClick={() => onChange({ source: 'all', uploader: 'all', from: '', to: '' })}
        >
          {t('clear')}
        </Button>
      )}
    </div>
  );
}
