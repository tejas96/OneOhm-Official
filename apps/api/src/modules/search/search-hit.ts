import type { SearchHit, SearchType } from '@oneohm/api-contracts';
import type { DatabaseExecutor } from '@oneohm/database';
import type { Actor } from '../../common/auth/actor';

/** What every finder gets: the words to match, the whole search for ranking, and how many to return. */
export interface SearchContext {
  readonly db: DatabaseExecutor;
  readonly actor: Actor;
  readonly words: readonly string[];
  readonly raw: string;
  readonly limit: number;
}

export type Finder = (context: SearchContext) => Promise<SearchHit[]>;

/** Present values only, so the second line never shows an empty part. */
export function factsOf(...values: readonly (string | null | undefined)[]): string[] {
  return values.filter((value): value is string => Boolean(value?.trim()));
}

export function hitOf(
  type: SearchType,
  id: string,
  title: string,
  rest: Partial<Omit<SearchHit, 'type' | 'id' | 'title'>> = {},
): SearchHit {
  return {
    type,
    id,
    title,
    facts: rest.facts ?? [],
    state: rest.state ?? null,
    parent: rest.parent ?? null,
    amountPaise: rest.amountPaise ?? null,
    phone: rest.phone ?? null,
  };
}
