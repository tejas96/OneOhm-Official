'use client';

import type { Product } from '@oneohm/api-contracts';
import {
  Button,
  Field,
  IconButton,
  Input,
  SearchSelect,
  Select,
  Sheet,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { addDays, todayIn } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { productOptions, useSearchWords } from '@/components/product-search';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useRefreshPurchasing } from '../use-purchasing';

const STOCK = 'stock';

interface LineDraft {
  readonly key: number;
  readonly productId: string | undefined;
  readonly quantity: string;
  readonly neededBy: string;
}

let next = 0;
const blankLine = (): LineDraft => ({
  key: ++next,
  productId: undefined,
  quantity: '',
  neededBy: addDays(todayIn(), 7),
});

function LineRow({
  line,
  index,
  products,
  errors,
  onChange,
  onRemove,
}: {
  readonly line: LineDraft;
  readonly index: number;
  readonly products: readonly Product[];
  readonly errors: Readonly<Record<string, string>>;
  readonly onChange: (patch: Partial<LineDraft>) => void;
  readonly onRemove: (() => void) | null;
}) {
  const t = useTranslations('purchasing.requests.form');
  const words = useSearchWords();
  const unit = products.find((product) => product.id === line.productId)?.unit;
  const error = (key: string) => errors[`lines.${index}.${key}`];
  return (
    <li className="grid gap-3 rounded-2xl border border-hairline p-4 sm:grid-cols-[minmax(0,1fr)_8rem_10rem_auto] sm:items-start">
      <Field label={t('item')} error={error('productId')}>
        <SearchSelect
          {...words}
          value={line.productId}
          onValueChange={(productId) => onChange({ productId })}
          placeholder={t('pickItem')}
          options={productOptions(products, (product) => product.sku)}
        />
      </Field>
      <Field label={t('quantity')} error={error('quantity')}>
        <Input
          inputMode="decimal"
          value={line.quantity}
          onChange={(event) => onChange({ quantity: event.target.value })}
          trailing={unit ? <span className="text-ink-faint">{unit}</span> : undefined}
        />
      </Field>
      <Field label={t('neededBy')} error={error('neededBy')}>
        <Input
          type="date"
          value={line.neededBy}
          min={todayIn()}
          onChange={(event) => onChange({ neededBy: event.target.value })}
        />
      </Field>
      {onRemove && (
        <IconButton label={t('removeLine')} variant="quiet" onClick={onRemove} className="sm:mt-7">
          <X />
        </IconButton>
      )}
    </li>
  );
}

/** Ask for material, for stock or for one project; procurement is alerted. */
export function RequestFormSheet({
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
  const t = useTranslations('purchasing.requests.form');
  const formId = useId();
  const toast = useToast();
  const refresh = useRefreshPurchasing();
  const form = useApiForm();
  const { reset } = form;
  const [project, setProject] = useState<string>(STOCK);
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<LineDraft[]>(() => [blankLine()]);
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
  const catalog = (products.data ?? []).filter((product) => product.active);

  useEffect(() => {
    if (!open) return;
    setProject(projectId ?? STOCK);
    setReason('');
    setLines([blankLine()]);
    reset();
  }, [open, projectId, reset]);

  const change = (key: number, patch: Partial<LineDraft>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await form.run(
      () =>
        expectStatus(
          api.purchasing.requests.create({
            body: {
              projectId: project === STOCK ? null : project,
              reason,
              lines: lines.map((line) => ({
                productId: line.productId ?? '',
                quantity: Number(line.quantity.replace(/,/g, '')) || 0,
                neededBy: line.neededBy,
              })),
            },
          }),
          201,
        ),
      async (created) => {
        await refresh();
        toast({ tone: 'success', title: t('done', { number: created.number }) });
        onCreated(created.id);
      },
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => !value && onClose()}
      title={t('title')}
      description={t('description')}
      width="lg"
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {t('submit')}
        </Button>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-6 px-5 py-6 sm:px-6"
      >
        <FormError message={form.error} />
        <Field label={t('for')} error={form.fieldErrors.projectId}>
          <Select
            value={project}
            onValueChange={setProject}
            options={[
              { value: STOCK, label: t('forStock') },
              ...(projects.data ?? []).map((row) => ({
                value: row.id,
                label: `${row.code} · ${row.name}`,
              })),
            ]}
          />
        </Field>
        <Field label={t('reason')} hint={t('reasonHint')} required error={form.fieldErrors.reason}>
          <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <section className="flex flex-col gap-3">
          <h3 className="type-overline text-ink-faint uppercase">{t('lines')}</h3>
          <FormError message={form.fieldErrors.lines ?? null} />
          <ul className="flex flex-col gap-3">
            {lines.map((line, index) => (
              <LineRow
                key={line.key}
                line={line}
                index={index}
                products={catalog}
                errors={form.fieldErrors}
                onChange={(patch) => change(line.key, patch)}
                onRemove={
                  lines.length > 1
                    ? () => setLines((current) => current.filter((row) => row.key !== line.key))
                    : null
                }
              />
            ))}
          </ul>
          <Button
            variant="secondary"
            leadingIcon={<Plus />}
            onClick={() => setLines((current) => [...current, blankLine()])}
            className="self-start"
          >
            {t('addLine')}
          </Button>
        </section>
      </form>
    </Sheet>
  );
}
