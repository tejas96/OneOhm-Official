'use client';

import type { ProjectMaterial } from '@oneohm/api-contracts';
import { Button, Field, Input, Select, Sheet, Textarea, useToast } from '@oneohm/design-system/web';
import { formatInr, todayIn } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { Wand2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useRefreshInventory, useVendors } from '../use-inventory';
import { draftTotals, type LineDraft, newLineKey, OrderLinesEditor } from './order-lines-editor';

const NO_PROJECT = 'stock';

/** Lines for what the project still needs that is not yet on an order. */
function linesFromMaterial(material: ProjectMaterial): LineDraft[] {
  return material.requirements
    .filter((row) => row.needed - row.ordered > 0)
    .map((row) => ({
      key: newLineKey(),
      kind: 'product',
      productId: row.productId,
      description: row.name,
      unit: row.unit,
      quantity: String(Math.round((row.needed - row.ordered) * 1000) / 1000),
      ratePaise: row.ratePaise,
      taxRateBp: row.taxRateBp,
    }));
}

/** A new purchase order, saved as a draft; a project link fills its lines from the BOM. */
export function OrderFormSheet({
  open,
  projectId,
  onClose,
  onCreated,
}: {
  readonly open: boolean;
  readonly projectId: string | null;
  readonly onClose: () => void;
  readonly onCreated: (id: string) => void;
}) {
  const t = useTranslations('inventory.orderForm');
  const formId = useId();
  const toast = useToast();
  const refresh = useRefreshInventory();
  const vendors = useVendors();
  const form = useApiForm();
  const [vendorId, setVendorId] = useState<string | undefined>(undefined);
  const [project, setProject] = useState<string>(NO_PROJECT);
  const [orderDate, setOrderDate] = useState(todayIn());
  const [expectedOn, setExpectedOn] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const filledFor = useRef<string | null>(null);
  const { reset } = form;

  const projects = useQuery({
    queryKey: ['projects', 'all'],
    queryFn: () => expectStatus(api.projects.listProjects(), 200),
    enabled: open,
  });
  const products = useQuery({
    queryKey: ['catalog', 'products'],
    queryFn: () => expectStatus(api.catalog.listProducts({ query: {} }), 200),
    enabled: open,
  });
  const chosenProject = project === NO_PROJECT ? null : project;
  const material = useQuery({
    queryKey: ['inventory', 'material', chosenProject ?? 'none'],
    queryFn: () =>
      expectStatus(api.inventory.material.get({ params: { id: chosenProject ?? '' } }), 200),
    enabled: open && chosenProject !== null,
  });

  useEffect(() => {
    if (!open) return;
    setVendorId(undefined);
    setProject(projectId ?? NO_PROJECT);
    setOrderDate(todayIn());
    setExpectedOn('');
    setNotes('');
    setLines([]);
    filledFor.current = null;
    reset();
  }, [open, projectId, reset]);

  // Opened from a project: fill its lines once, as soon as the material is known.
  useEffect(() => {
    if (!material.data || filledFor.current === material.data.projectId) return;
    if (material.data.projectId !== projectId) return;
    filledFor.current = material.data.projectId;
    setLines(linesFromMaterial(material.data));
  }, [material.data, projectId]);

  const fill = () => {
    if (!material.data) return;
    const next = linesFromMaterial(material.data);
    if (next.length === 0) toast({ tone: 'info', title: t('nothingToFill') });
    setLines((current) => [...current.filter((line) => line.productId === null), ...next]);
  };

  const { subtotalPaise: subtotal, totalPaise: total } = draftTotals(lines);
  const activeVendors = (vendors.data ?? []).filter((vendor) => vendor.active);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await form.run(() =>
      expectStatus(
        api.inventory.purchaseOrders.create({
          body: {
            vendorId: vendorId ?? '',
            projectId: chosenProject,
            orderDate,
            expectedOn: expectedOn || null,
            notes,
            lines: lines.map((line) => ({
              productId: line.kind === 'product' ? line.productId : null,
              description: line.description,
              unit: line.unit,
              quantity: Number(line.quantity.replace(/,/g, '')),
              ratePaise: line.ratePaise ?? 0,
              taxRateBp: line.taxRateBp ?? 0,
            })),
          },
        }),
        201,
      ),
    );
    if (!saved) return;
    await refresh(chosenProject);
    toast({ tone: 'success', title: t('created', { number: saved.number }) });
    onCreated(saved.id);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('title')}
      description={t('description')}
      width="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-4">
          <p className="type-body-sm text-ink-muted">
            {t('subtotal')} {formatInr(subtotal)} · {t('tax')} {formatInr(total - subtotal)}
            <span className="ml-3 type-title-md text-ink tabular-nums">{formatInr(total)}</span>
          </p>
          <Button type="submit" form={formId} variant="primary" pending={form.pending}>
            {t('save')}
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-5 px-5 py-6 sm:px-6"
      >
        <FormError message={form.error} />
        <Field
          label={t('vendor')}
          error={form.fieldErrors.vendorId}
          hint={activeVendors.length === 0 ? t('noVendors') : undefined}
          required
        >
          <Select
            value={vendorId}
            onValueChange={setVendorId}
            placeholder={t('vendorPlaceholder')}
            options={activeVendors.map((vendor) => ({ value: vendor.id, label: vendor.name }))}
            label={t('vendor')}
          />
        </Field>
        <Field label={t('project')} hint={t('projectHint')} error={form.fieldErrors.projectId}>
          <Select
            value={project}
            onValueChange={setProject}
            options={[
              { value: NO_PROJECT, label: t('noProject') },
              ...(projects.data ?? [])
                .filter((entry) => entry.status === 'active' || entry.id === projectId)
                .map((entry) => ({ value: entry.id, label: `${entry.code} · ${entry.name}` })),
            ]}
            label={t('project')}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('orderDate')} error={form.fieldErrors.orderDate} required>
            <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </Field>
          <Field label={t('expectedOn')} error={form.fieldErrors.expectedOn}>
            <Input type="date" value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-hairline pt-5">
          <h3 className="type-title-md text-ink">{t('lines')}</h3>
          {chosenProject && (
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Wand2 />}
              onClick={fill}
              disabled={!material.data}
              title={t('fillHint')}
            >
              {t('fillFromProject')}
            </Button>
          )}
        </div>
        {form.fieldErrors.lines && (
          <p className="type-body-sm text-overdue">{form.fieldErrors.lines}</p>
        )}
        <OrderLinesEditor
          lines={lines}
          products={products.data ?? []}
          errors={form.fieldErrors}
          onChange={setLines}
        />
        <Field label={t('notes')} error={form.fieldErrors.notes}>
          <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
      </form>
    </Sheet>
  );
}
