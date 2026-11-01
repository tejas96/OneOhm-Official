import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CompanyAssets } from '@oneohm/api-contracts';
import { documents } from '@oneohm/database';
import {
  COMPANY_ASSET_FILE_TYPES,
  COMPANY_ASSET_KINDS,
  type CompanyAssetKind,
  companyAssetCategory,
} from '@oneohm/domain';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { DATABASE, type Database } from '../../config/core.module';
import { toAttachment } from './document-read';
import { ObjectStorageService } from './object-storage.service';
import { checkFile, type IncomingFile } from './upload-file';

export type AssetImages = Readonly<Record<CompanyAssetKind, string | null>>;

const LABEL: Readonly<Record<CompanyAssetKind, string>> = {
  logo: 'Company logo',
  signature: 'Authorised signature',
  stamp: 'Company stamp',
};

/**
 * The company's logo, signature and stamp (Settings → Company). Quotations and reports
 * print the uploaded images; until one is uploaded they use the bundled brand files.
 */
@Injectable()
export class CompanyAssetsService {
  private readonly logger = new Logger(CompanyAssetsService.name);
  private images: Promise<AssetImages> | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: ObjectStorageService,
  ) {}

  async current(): Promise<CompanyAssets> {
    const rows = await this.rows();
    const byKind = (kind: CompanyAssetKind) => {
      const row = rows.find((entry) => entry.category === companyAssetCategory(kind));
      return row ? toAttachment(row) : null;
    };
    return { logo: byKind('logo'), signature: byKind('signature'), stamp: byKind('stamp') };
  }

  async upload(
    actor: Actor,
    kind: CompanyAssetKind,
    file: IncomingFile | undefined,
  ): Promise<CompanyAssets> {
    assertCan(actor, 'settings.manage');
    const checked = checkFile(file, COMPANY_ASSET_FILE_TYPES, LABEL[kind]);
    const storageKey = `company/${kind}/${randomUUID()}/${checked.keyName}`;
    await this.storage.put(storageKey, checked.buffer, checked.contentType);
    const category = companyAssetCategory(kind);
    await this.db.transaction(async (tx) => {
      const [previous] = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.category, category), isNull(documents.replacedAt)))
        .limit(1);
      if (previous) {
        await tx
          .update(documents)
          .set({ replacedAt: new Date(), replacedByUserId: actor.userId })
          .where(eq(documents.id, previous.id));
      }
      const [row] = await tx
        .insert(documents)
        .values({
          category,
          source: 'upload',
          name: checked.name,
          storageKey,
          contentType: checked.contentType,
          sizeBytes: checked.buffer.length,
          replacesDocumentId: previous?.id ?? null,
          uploadedByUserId: actor.userId,
        })
        .returning({ id: documents.id });
      if (!row) throw new Error('Document insert returned nothing');
      await recordAudit(tx, actor.userId, 'company.asset_uploaded', 'document', row.id, {
        kind,
        replaced: previous?.id ?? null,
      });
    });
    this.images = null;
    return this.current();
  }

  /** Data URIs for the PDF templates; cached until the next upload. */
  async dataUris(): Promise<AssetImages> {
    this.images ??= this.loadImages().catch((error: unknown) => {
      this.images = null;
      this.logger.warn(`Company assets unavailable, using bundled files: ${String(error)}`);
      return { logo: null, signature: null, stamp: null };
    });
    return this.images;
  }

  private async loadImages(): Promise<AssetImages> {
    const rows = await this.rows();
    const entries = await Promise.all(
      COMPANY_ASSET_KINDS.map(async (kind) => {
        const row = rows.find((entry) => entry.category === companyAssetCategory(kind));
        if (!row) return [kind, null] as const;
        const bytes = await this.storage.getBuffer(row.storageKey);
        return [kind, `data:${row.contentType};base64,${bytes.toString('base64')}`] as const;
      }),
    );
    return Object.fromEntries(entries) as AssetImages;
  }

  private rows() {
    return this.db
      .select()
      .from(documents)
      .where(
        and(
          inArray(
            documents.category,
            COMPANY_ASSET_KINDS.map((kind) => companyAssetCategory(kind)),
          ),
          isNull(documents.replacedAt),
          isNull(documents.removedAt),
        ),
      );
  }
}
