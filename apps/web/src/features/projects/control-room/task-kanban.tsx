'use client';

import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { ProjectTask } from '@oneohm/api-contracts';
import { Button, cn, useToast } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import {
  BOARD_COLUMNS,
  type BoardColumn,
  boardColumns,
  boardMove,
  columnStep,
} from '../tasks/board-moves';
import { type CardRunner, KanbanCard } from './kanban-card';

/**
 * The project's tasks by status. A drop runs the same step as the task's own button
 * (`boardMove`); nothing moves on screen until the server agrees, so a cancelled form
 * leaves the card where it was.
 */
export function TaskKanban({ tasks }: { readonly tasks: readonly ProjectTask[] }) {
  const t = useTranslations('projects.kanban');
  const statusT = useTranslations('projects.task.status');
  const toast = useToast();
  const runners = useRef(new Map<string, CardRunner>());
  const [showDone, setShowDone] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const columns = boardColumns(tasks);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: jumpColumns }),
  );
  const register = useCallback((id: string, runner: CardRunner | null) => {
    if (runner) runners.current.set(id, runner);
    else runners.current.delete(id);
  }, []);

  const titleOf = (id: string | number) => tasks.find((task) => task.id === id)?.title ?? '';
  const columnName = (id: string | number | undefined) => (id ? statusT(String(id)) : t('nowhere'));
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('announce.start', { title: titleOf(active.id) }),
    onDragOver: ({ active, over }) =>
      t('announce.over', { title: titleOf(active.id), column: columnName(over?.id) }),
    onDragEnd: ({ active, over }) =>
      t('announce.end', { title: titleOf(active.id), column: columnName(over?.id) }),
    onDragCancel: ({ active }) => t('announce.cancel', { title: titleOf(active.id) }),
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const task = tasks.find((entry) => entry.id === active.id);
    const runner = runners.current.get(String(active.id));
    if (!task || !runner || !over) return;
    const move = boardMove(task, over.id as BoardColumn, runner.rights);
    if (move.kind === 'step') runner.run(move.step);
    else if (move.reason !== 'same')
      toast({ tone: 'error', title: t(`denied.${move.reason}`), description: task.title });
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) => setDragging(String(active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
      accessibility={{ announcements }}
    >
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-3">
          {BOARD_COLUMNS.map((column) => (
            <Column
              key={column}
              column={column}
              title={statusT(column)}
              count={columns[column].length}
            >
              {column === 'completed' && !showDone ? (
                columns.completed.length > 0 && (
                  <Button size="sm" variant="quiet" onClick={() => setShowDone(true)}>
                    {t('show', { count: columns.completed.length })}
                  </Button>
                )
              ) : columns[column].length === 0 ? (
                <p className="px-1 py-3 type-body-sm text-ink-faint">{t('empty')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {columns[column].map((task) => (
                    <KanbanCard key={task.id} task={task} register={register} />
                  ))}
                </ul>
              )}
            </Column>
          ))}
        </div>
      </div>
      <DragOverlay>
        {dragging && (
          <div className="w-60 rounded-lg border border-accent/40 bg-surface p-3 type-body font-medium text-ink shadow-e3">
            {titleOf(dragging)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * Keyboard moves jump a whole column per arrow key, so a picked-up card lands on the
 * next status instead of creeping a few pixels at a time.
 */
const jumpColumns: KeyboardCoordinateGetter = (event, { active, currentCoordinates, context }) => {
  const { collisionRect, droppableRects, over } = context;
  if (!collisionRect) return undefined;
  const from = (over?.id ?? context.active?.data.current?.task?.status) as BoardColumn | undefined;
  const to = from ? columnStep(from, event.code) : null;
  if (!to) return undefined;
  event.preventDefault();
  const rect = droppableRects.get(to);
  if (!rect || !active) return currentCoordinates;
  return { x: rect.left + rect.width / 2 - collisionRect.width / 2, y: currentCoordinates.y };
};

function Column({
  column,
  title,
  count,
  children,
}: {
  readonly column: BoardColumn;
  readonly title: string;
  readonly count: number;
  readonly children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column });
  return (
    <section
      ref={setNodeRef}
      aria-label={title}
      className={cn(
        'flex w-64 shrink-0 flex-col gap-2 rounded-xl bg-sunken/60 p-2 transition-colors',
        isOver && 'bg-accent/10 outline-2 outline-accent/40',
      )}
    >
      <h3 className="flex items-center justify-between px-1 pt-1 type-title-md text-ink">
        {title}
        <span className="font-mono text-[0.75rem] text-ink-faint">{count}</span>
      </h3>
      {children}
    </section>
  );
}
