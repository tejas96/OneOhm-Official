'use client';

import { Button, cn } from '@oneohm/design-system/web';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { GAP, pageNumbers } from '@/lib/query/page-numbers';
import type { ListPaging } from '@/lib/query/use-list-paging';
import { LoadMore } from './load-more';

/**
 * The foot of a paged list, for either mode of `useListPaging`: "Show more" for `more`,
 * page buttons for `numbers`. Put it under the rows; it hides itself when there is
 * nothing more to show.
 */
export function ListPager<TItem>({
  paging,
  className,
}: {
  readonly paging: ListPaging<TItem>;
  readonly className?: string;
}) {
  if (paging.mode === 'more') {
    return (
      <LoadMore
        shown={paging.items.length}
        total={paging.total}
        hasMore={paging.more.hasMore}
        loading={paging.more.loading}
        onMore={paging.more.load}
        {...(className ? { className } : {})}
      />
    );
  }
  return <NumberedPager paging={paging} {...(className ? { className } : {})} />;
}

/** "Showing 31–60 of 733", then Previous, the page numbers and Next. */
function NumberedPager<TItem>({
  paging,
  className,
}: {
  readonly paging: ListPaging<TItem>;
  readonly className?: string;
}) {
  const t = useTranslations('lists');
  const { page, pageCount, pageSize, fetching, setPage } = paging.numbers;
  if (paging.total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, paging.total);
  const go = (next: number) => {
    setPage(next);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav
      aria-label={t('pages')}
      className={cn(
        'flex flex-col items-center gap-3 pt-2 pb-4 sm:flex-row sm:justify-between',
        className,
      )}
    >
      <p className="type-body-sm text-ink-faint tabular-nums" aria-live="polite">
        {t('range', { from, to, total: paging.total })}
      </p>
      {pageCount > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <Button
            variant="quiet"
            size="sm"
            leadingIcon={<ChevronLeft aria-hidden />}
            disabled={page <= 1}
            onClick={() => go(page - 1)}
          >
            <span className="max-sm:sr-only">{t('previous')}</span>
          </Button>
          {pageNumbers(page, pageCount).map((slot, index) =>
            slot === GAP ? (
              <span
                // Gaps have no page of their own; their place in the row is stable.
                key={`gap-${index}`}
                aria-hidden
                className="px-1.5 type-body-sm text-ink-faint"
              >
                …
              </span>
            ) : (
              <Button
                key={slot}
                variant={slot === page ? 'secondary' : 'quiet'}
                size="sm"
                aria-current={slot === page ? 'page' : undefined}
                aria-label={t('page', { page: slot })}
                pending={fetching && slot === page}
                onClick={() => slot !== page && go(slot)}
                className="min-w-9 tabular-nums"
              >
                {slot}
              </Button>
            ),
          )}
          <Button
            variant="quiet"
            size="sm"
            trailingIcon={<ChevronRight aria-hidden />}
            disabled={page >= pageCount}
            onClick={() => go(page + 1)}
          >
            <span className="max-sm:sr-only">{t('next')}</span>
          </Button>
        </div>
      )}
    </nav>
  );
}
