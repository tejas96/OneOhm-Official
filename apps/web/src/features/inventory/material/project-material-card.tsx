'use client';

import type { MaterialRequirement, ProjectMaterial } from '@oneohm/api-contracts';
import {
  Button,
  Card,
  CardHeader,
  type PillTone,
  StatusPill,
  useToast,
} from '@oneohm/design-system/web';
import { useMutation } from '@tanstack/react-query';
import { ClipboardList, Lock, Truck, Unlock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError, describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { formatQuantity, useProjectMaterial, useRefreshInventory } from '../use-inventory';
import { DispatchDialog } from './dispatch-dialog';

const STAGE_TONE: Readonly<Record<ProjectMaterial['stage'], PillTone>> = {
  to_order: 'neutral',
  ordered: 'waiting',
  reserved: 'onTrack',
  dispatched: 'done',
};

/** The project's material at a glance: what it needs, ordered, held and sent to site. */
export function ProjectMaterialCard({ projectId }: { readonly projectId: string }) {
  const t = useTranslations('inventory.material');
  const toast = useToast();
  const refresh = useRefreshInventory();
  const canBuy = useCan('procurement.manage');
  const canStore = useCan('inventory.manage');
  const canDispatch = useCan('dispatch.manage');
  const canSeeStock = useCan('inventory.view');
  const canSeeProjects = useCan('projects.view_all');
  const canView = canSeeStock || canSeeProjects || canBuy || canStore || canDispatch;
  const material = useProjectMaterial(canView ? projectId : null);
  const [dispatching, setDispatching] = useState(false);
  const [short, setShort] = useState<readonly string[]>([]);

  const action = useMutation({
    mutationFn: (which: 'reserve' | 'release') =>
      which === 'reserve'
        ? expectStatus(
            api.inventory.material.reserve({
              params: { id: projectId },
              body: { locationId: null },
            }),
            200,
          )
        : expectStatus(api.inventory.material.release({ params: { id: projectId } }), 200),
    onSuccess: async (_data, which) => {
      setShort([]);
      await refresh(projectId);
      toast({ tone: 'success', title: t(which === 'reserve' ? 'reserved' : 'released') });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'shortage') {
        setShort(Object.values(error.fieldErrors));
        return;
      }
      toast({ tone: 'error', title: t('failed'), description: describeError(error) });
    },
  });

  const data = material.data;
  if (!data) return null;
  const reserved = data.requirements.some((row) => row.reserved > 0);
  const outstanding = data.requirements.some((row) => row.reserved + row.dispatched < row.needed);
  const showRaise = canBuy && data.stage === 'to_order';
  const showReserve = canStore && outstanding;
  const showHeld = reserved && (canStore || canDispatch);

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader
        title={t('title')}
        action={
          <StatusPill tone={STAGE_TONE[data.stage]} label={t(`stages.${data.stage}`)} size="sm" />
        }
      />
      <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
        {data.requirements.map((row) => (
          <RequirementRow key={row.productId} row={row} />
        ))}
      </ul>
      {short.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-hairline bg-at-risk-tint px-5 py-3">
          <p className="type-body-sm font-medium text-at-risk">{t('shortTitle')}</p>
          {short.map((line) => (
            <p key={line} className="type-label text-ink-muted">
              {line}
            </p>
          ))}
        </div>
      )}
      <MaterialLinks material={data} />
      {(showRaise || showReserve || showHeld) && (
        <div className="flex flex-wrap gap-2 border-t border-hairline px-5 py-3">
          {showRaise && (
            <Button asChild size="sm" variant="secondary" leadingIcon={<ClipboardList />}>
              <Link href={`/inventory?tab=orders&new=1&projectId=${projectId}`}>
                {t('raisePo')}
              </Link>
            </Button>
          )}
          {showReserve && (
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<Lock />}
              pending={action.isPending && action.variables === 'reserve'}
              disabled={action.isPending}
              onClick={() => action.mutate('reserve')}
            >
              {t('reserve')}
            </Button>
          )}
          {canStore && reserved && (
            <Button
              size="sm"
              variant="quiet"
              leadingIcon={<Unlock />}
              pending={action.isPending && action.variables === 'release'}
              disabled={action.isPending}
              onClick={() => action.mutate('release')}
            >
              {t('release')}
            </Button>
          )}
          {canDispatch && reserved && (
            <Button
              size="sm"
              variant="primary"
              leadingIcon={<Truck />}
              onClick={() => setDispatching(true)}
            >
              {t('dispatch')}
            </Button>
          )}
        </div>
      )}
      <DispatchDialog material={dispatching ? data : null} onClose={() => setDispatching(false)} />
    </Card>
  );
}

function RequirementRow({ row }: { readonly row: MaterialRequirement }) {
  const t = useTranslations('inventory.material');
  const share = (value: number) => `${Math.min(100, (value / Math.max(row.needed, 1e-9)) * 100)}%`;
  return (
    <li className="flex flex-col gap-2 px-5 py-3.5">
      <p className="flex items-baseline justify-between gap-3">
        <span className="truncate type-body-sm font-medium text-ink">{row.name}</span>
        <span className="shrink-0 font-mono text-[0.75rem] text-ink-muted">
          {t('needed', { needed: formatQuantity(row.needed), unit: row.unit })}
        </span>
      </p>
      <span className="relative h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-accent/25"
          style={{ width: share(row.ordered) }}
        />
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-accent/60"
          style={{ width: share(row.reserved + row.dispatched) }}
        />
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: share(row.dispatched) }}
        />
      </span>
      <p className="type-label text-ink-faint">
        {t('progress', {
          ordered: formatQuantity(row.ordered),
          reserved: formatQuantity(row.reserved),
          dispatched: formatQuantity(row.dispatched),
        })}{' '}
        · {t('free', { free: formatQuantity(row.freeInStore) })}
      </p>
    </li>
  );
}

/** The project's purchase orders (each opens in Inventory) and delivery challans. */
function MaterialLinks({ material }: { readonly material: ProjectMaterial }) {
  const t = useTranslations('inventory.material');
  if (material.purchaseOrders.length === 0 && material.dispatches.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 border-t border-hairline px-5 py-3 type-label text-ink-muted">
      {material.purchaseOrders.length > 0 && (
        <p>
          {t('orders')}:{' '}
          {material.purchaseOrders.map((order, index) => (
            <span key={order.id}>
              {index > 0 && ', '}
              <Link
                href={`/inventory?tab=orders&order=${order.id}`}
                className="font-mono text-accent hover:underline"
              >
                {order.number}
              </Link>
            </span>
          ))}
        </p>
      )}
      {material.dispatches.length > 0 && (
        <p>
          {t('challans')}:{' '}
          <span className="font-mono text-ink">
            {material.dispatches.map((dispatch) => dispatch.number).join(', ')}
          </span>
        </p>
      )}
    </div>
  );
}
