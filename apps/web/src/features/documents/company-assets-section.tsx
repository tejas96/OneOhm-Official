'use client';

import type { Attachment, CompanyAssets } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { COMPANY_ASSET_KINDS, type CompanyAssetKind } from '@oneohm/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SettingsSection } from '@/features/settings/settings-section';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { documentUrl, uploadCompanyAsset } from '@/lib/api/upload';

const ASSETS_KEY = ['company-assets'] as const;

/**
 * The logo, signature and stamp printed on quotations and reports. Until one is
 * uploaded, documents use the images that ship with OneOhm.
 */
export function CompanyAssetsSection() {
  const t = useTranslations('documents.company');
  const query = useQuery({
    queryKey: ASSETS_KEY,
    queryFn: () => expectStatus(api.documents.companyAssets(), 200),
  });
  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <ul className="grid gap-4 sm:grid-cols-3">
        {COMPANY_ASSET_KINDS.map((kind) => (
          <AssetTile key={kind} kind={kind} current={query.data?.[kind] ?? null} />
        ))}
      </ul>
      <p className="type-label text-ink-faint">{t('hint')}</p>
    </SettingsSection>
  );
}

function AssetTile({
  kind,
  current,
}: {
  readonly kind: CompanyAssetKind;
  readonly current: Attachment | null;
}) {
  const t = useTranslations('documents.company');
  const toast = useToast();
  const client = useQueryClient();
  const upload = useMutation({
    mutationFn: (file: File) => uploadCompanyAsset(kind, file),
    onSuccess: (assets: CompanyAssets) => {
      client.setQueryData(ASSETS_KEY, assets);
      toast({ tone: 'success', title: t('saved', { kind: t(`kinds.${kind}`) }) });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
  return (
    <li className="flex flex-col gap-2">
      <p className="type-label font-medium text-ink">{t(`kinds.${kind}`)}</p>
      <label className="group relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-rule bg-[repeating-conic-gradient(var(--oh-sunken)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] transition-colors hover:border-accent focus-within:outline-2 focus-within:outline-focus">
        {current ? (
          // biome-ignore lint/performance/noImgElement: authenticated API files cannot go through next/image.
          <img
            src={documentUrl(current.id)}
            alt={t(`kinds.${kind}`)}
            className="max-h-[80%] max-w-[85%] object-contain"
          />
        ) : (
          <span className="flex flex-col items-center gap-1.5 px-3 text-center type-label text-ink-muted">
            <ImagePlus aria-hidden className="size-5 text-ink-faint" />
            {t('usingBundled')}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-canvas/85 py-1.5 type-label font-medium text-accent opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {upload.isPending ? (
            <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
          ) : (
            <ImagePlus aria-hidden className="size-3.5" />
          )}
          {current ? t('replace') : t('upload')}
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label={t('choose', { kind: t(`kinds.${kind}`) })}
          disabled={upload.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload.mutate(file);
            event.target.value = '';
          }}
        />
      </label>
    </li>
  );
}
