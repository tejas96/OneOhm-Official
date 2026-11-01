'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { Button, StatusPill, useToast } from '@oneohm/design-system/web';
import { Eraser, PenLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type PointerEvent, useRef, useState } from 'react';
import { describeError } from '@/lib/api/api-error';
import { uploadDocument } from '@/lib/api/upload';
import { useInvalidateWork } from './use-task-actions';

const WIDTH = 640;
const HEIGHT = 220;

/**
 * The customer signs on screen (a tablet at the site, or a mouse in the office). The
 * signature is saved as a picture on the task, like the field app's sign-off.
 */
export function SignaturePad({ task }: { readonly task: ProjectTask }) {
  const t = useTranslations('projects.complete.signature');
  const toast = useToast();
  const invalidate = useInvalidateWork();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [inked, setInked] = useState(false);
  const [saving, setSaving] = useState(false);
  const signed = task.attachments.some((file) => file.category === 'customer_signature');

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * WIDTH,
      y: ((event.clientY - box.top) / box.height) * HEIGHT,
    };
  };
  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = point(event);
    context.lineWidth = 2.5;
    context.lineCap = 'round';
    context.strokeStyle = '#111111';
    context.beginPath();
    context.moveTo(x, y);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const context = canvas.current?.getContext('2d');
    if (!drawing.current || !context) return;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
    setInked(true);
  };
  const clear = () => {
    canvas.current?.getContext('2d')?.clearRect(0, 0, WIDTH, HEIGHT);
    setInked(false);
  };
  const save = () => {
    canvas.current?.toBlob(async (blob) => {
      if (!blob) return;
      setSaving(true);
      try {
        const file = new File([blob], 'customer-signature.png', { type: 'image/png' });
        await uploadDocument(file, { category: 'customer_signature', taskId: task.id }, () => {});
        await invalidate();
        clear();
        toast({ tone: 'success', title: t('saved') });
      } catch (error) {
        toast({ tone: 'error', title: t('failed'), description: describeError(error) });
      } finally {
        setSaving(false);
      }
    }, 'image/png');
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-overline text-ink-faint uppercase">{t('title')}</p>
        <StatusPill
          size="sm"
          tone={signed ? 'done' : 'atRisk'}
          label={signed ? t('signed') : t('needed')}
        />
      </div>
      <canvas
        ref={canvas}
        width={WIDTH}
        height={HEIGHT}
        aria-label={t('area')}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={() => {
          drawing.current = false;
        }}
        className="w-full touch-none rounded-xl border border-rule bg-white"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="quiet"
          leadingIcon={<Eraser />}
          onClick={clear}
          disabled={!inked}
        >
          {t('clear')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          leadingIcon={<PenLine />}
          onClick={save}
          disabled={!inked}
          pending={saving}
        >
          {signed ? t('replace') : t('save')}
        </Button>
      </div>
    </section>
  );
}
