import type { KeyboardEvent } from 'react';

const STEPS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/** Far enough to cross every row or column of the grid. */
const REACH = 64;

/**
 * Arrow keys move focus between the grid's editable cells (`data-cell="row:column"`),
 * jumping over cells that cannot be changed. Tab still walks every cell in order.
 */
export function moveFocusWithArrows(event: KeyboardEvent<HTMLElement>): void {
  const step = STEPS[event.key];
  const target = event.target;
  if (!step || !(target instanceof HTMLElement) || !target.dataset.cell) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const [row = 0, column = 0] = target.dataset.cell.split(':').map(Number);
  for (let distance = 1; distance <= REACH; distance += 1) {
    const next = event.currentTarget.querySelector<HTMLElement>(
      `[data-cell="${row + step[0] * distance}:${column + step[1] * distance}"]`,
    );
    if (next) {
      event.preventDefault();
      next.focus();
      return;
    }
  }
}
