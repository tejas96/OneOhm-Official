'use client';

import { Card, CardHeader, cn, Input, Select } from '@oneohm/design-system/web';
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@oneohm/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Search, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCan } from '@/providers/current-user';
import { DocumentRow } from './document-row';
import { PendingThumb } from './document-thumb';
import { useUploads } from './use-uploads';

type Scope = { readonly projectId: string } | { readonly customerId: string };

export const documentsQueryKey = (scope: Scope) => ['documents', scope] as const;

/**
 * Every file of a project or customer in one place (PRD 3.14): search by name, filter by
 * category, view, download and replace; upload with a category.
 */
export function DocumentsPanel({
  scope,
  className,
  titled = true,
}: {
  readonly scope: Scope;
  readonly className?: string;
  /** False where the page already shows a "Documents" heading above the card. */
  readonly titled?: boolean;
}) {
  const t = useTranslations('documents');
  const client = useQueryClient();
  const canManage = useCan('documents.manage');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DocumentCategory | 'all'>('all');
  const [category, setCategory] = useState<DocumentCategory>('other');
  const query = useQuery({
    queryKey: documentsQueryKey(scope),
    queryFn: () => expectStatus(api.documents.listDocuments({ query: scope }), 200),
  });
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['documents'] }),
      client.invalidateQueries({ queryKey: ['project'] }),
    ]);
  const uploads = useUploads({ category, ...scope }, refresh);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (query.data ?? []).filter(
      (document) =>
        (filter === 'all' || document.category === filter) &&
        (!needle || document.name.toLowerCase().includes(needle)),
    );
  }, [filter, query.data, search]);
  const categoryOptions = DOCUMENT_CATEGORIES.map((value) => ({
    value,
    label: t(`categories.${value}`),
  }));

  return (
    <Card id="documents" className={cn('flex scroll-mt-24 flex-col overflow-hidden', className)}>
      {titled ? (
        <CardHeader
          title={t('title')}
          description={query.data ? t('count', { count: query.data.length }) : undefined}
        />
      ) : (
        <p className="px-5 pt-4 pb-3 type-body-sm text-ink-muted">
          {query.data ? t('count', { count: query.data.length }) : t('loading')}
        </p>
      )}
      {canManage && (
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-5 py-3">
          <Select
            label={t('uploadAs')}
            value={category}
            onValueChange={setCategory}
            options={categoryOptions}
            className="min-w-44 flex-1"
          />
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-accent px-3.5 type-body-sm font-medium text-on-accent shadow-e1 transition-colors hover:bg-accent-hover focus-within:outline-2 focus-within:outline-focus">
            <Upload aria-hidden className="size-4" />
            {t('upload')}
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              className="sr-only"
              onChange={(event) => {
                uploads.add(event.target.files);
                event.target.value = '';
              }}
            />
          </label>
        </div>
      )}
      {uploads.pending.length > 0 && (
        <ul className="grid grid-cols-4 gap-2 border-t border-hairline px-5 py-3">
          {uploads.pending.map((upload) => (
            <PendingThumb
              key={upload.key}
              upload={upload}
              onRetry={() => uploads.retry(upload.key)}
              onDiscard={() => uploads.discard(upload.key)}
            />
          ))}
        </ul>
      )}
      {(query.data?.length ?? 0) > 3 && (
        <div className="flex flex-wrap gap-2 border-t border-hairline px-5 py-3">
          <span className="relative min-w-40 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('search')}
              aria-label={t('search')}
              className="pl-9"
            />
          </span>
          <Select
            label={t('filter')}
            value={filter}
            onValueChange={setFilter}
            options={[{ value: 'all' as const, label: t('allCategories') }, ...categoryOptions]}
            className="min-w-40"
          />
        </div>
      )}
      <div className="border-t border-hairline">
        {query.isPending && (
          <div className="p-5">
            <ListSkeleton label={t('loading')} rows={3} />
          </div>
        )}
        {query.isError && (
          <div className="p-5">
            <LoadError error={query.error} onRetry={() => query.refetch()} />
          </div>
        )}
        {query.data && shown.length === 0 && (
          <p className="flex items-center gap-2 px-5 py-6 type-body-sm text-ink-muted">
            <FolderOpen aria-hidden className="size-4 text-ink-faint" />
            {query.data.length === 0 ? t('empty') : t('noMatch')}
          </p>
        )}
        {shown.length > 0 && (
          <ul className="flex flex-col divide-y divide-hairline">
            {shown.map((document) => (
              <DocumentRow
                key={document.id}
                document={document}
                canReplace={canManage}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
