/**
 * Lets a documents list or checklist file any new system paper (quotation, invoice,
 * receipt, work order) before it reads, without the documents module depending on the
 * modules that print them. The system papers service registers itself at start.
 */
export interface PaperScopeHint {
  readonly projectId?: string | undefined;
  readonly customerId?: string | undefined;
  readonly contractorId?: string | undefined;
}

type Filer = (scope: PaperScopeHint) => Promise<unknown>;

let filer: Filer | null = null;

export function setSystemPaperFiler(next: Filer | null): void {
  filer = next;
}

/** At most this long; anything slower finishes in the background and shows next time. */
const WAIT_MS = 4000;

/** Files what is missing for this scope; never fails or holds up the caller for long. */
export async function fileSystemPapers(scope: PaperScopeHint): Promise<void> {
  if (!filer || !(scope.projectId || scope.customerId || scope.contractorId)) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = filer(scope).catch(() => undefined);
  const limit = new Promise((resolve) => {
    timer = setTimeout(resolve, WAIT_MS);
  });
  await Promise.race([work, limit]);
  clearTimeout(timer);
}
