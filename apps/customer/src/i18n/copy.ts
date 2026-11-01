import type { CustomerLanguage } from '@oneohm/domain';
import { currentLanguage } from './language';

/**
 * The shape of an English copy module with every string widened, so the Marathi and
 * Hindi modules must say every line (same keys, same lists, same function arguments).
 */
export type Copy<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Copy<R>
    : T extends readonly unknown[]
      ? { readonly [K in keyof T]: Copy<T[K]> }
      : T extends object
        ? { readonly [K in keyof T]: Copy<T[K]> }
        : T;

/**
 * One copy module in all three languages, read in the current language each time a
 * property is read. Screens keep using the same names (`COMMON.retry`).
 */
export function inEveryLanguage<T extends object>(
  english: T,
  marathi: Copy<T>,
  hindi: Copy<T>,
): Copy<T> {
  const tables: Readonly<Record<CustomerLanguage, Copy<T>>> = {
    'en-IN': english as Copy<T>,
    'mr-IN': marathi,
    'hi-IN': hindi,
  };
  const live = {} as Copy<T>;
  for (const key of Object.keys(english) as (keyof Copy<T>)[]) {
    Object.defineProperty(live, key, {
      enumerable: true,
      get: () => tables[currentLanguage()][key],
    });
  }
  return Object.freeze(live) as Copy<T>;
}

/** A name from a copy table by a key from OneOhm, or undefined for a key the app does not know. */
export function lookup(table: object, key: string): string | undefined {
  if (!Object.hasOwn(table, key)) return undefined;
  const value: unknown = (table as Readonly<Record<string, unknown>>)[key];
  return typeof value === 'string' ? value : undefined;
}
