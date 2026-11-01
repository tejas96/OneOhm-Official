import type { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';

export interface StoredObject {
  readonly body: Readable;
  readonly contentType: string | undefined;
  readonly length: number | undefined;
  /** "bytes 0-1023/52000" when only part of the file was asked for and sent. */
  readonly contentRange?: string | undefined;
}

/**
 * Files in RustFS (S3 API, path-style). The bucket is private: every read goes through
 * the API's access check, never a public URL.
 */
@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ENVIRONMENT) private readonly env: Environment) {
    this.bucket = env.STORAGE_BUCKET;
    this.client = new S3Client({
      endpoint: env.STORAGE_ENDPOINT,
      region: env.STORAGE_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: env.STORAGE_ACCESS_KEY, secretAccessKey: env.STORAGE_SECRET_KEY },
    });
  }

  async onModuleInit(): Promise<void> {
    const autoCreate = this.env.STORAGE_AUTO_CREATE_BUCKET ?? this.env.NODE_ENV !== 'production';
    if (!autoCreate) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created storage bucket "${this.bucket}".`);
      } catch (error) {
        // Start anyway: uploads will report the problem clearly when they happen.
        this.logger.warn(
          `Storage bucket "${this.bucket}" is not reachable: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
      }),
    );
  }

  /**
   * The stored file, or one byte range of it ("bytes=0-1023") so a video can seek. A
   * range past the end is ignored and the whole file is sent, as HTTP allows.
   */
  async get(key: string, range?: string): Promise<StoredObject> {
    const send = (part?: string) =>
      this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key, ...(part ? { Range: part } : {}) }),
      );
    const result = await send(range).catch((error: unknown) => {
      if (range && (error as { name?: string }).name === 'InvalidRange') return send();
      throw error;
    });
    return {
      body: result.Body as Readable,
      contentType: result.ContentType,
      length: result.ContentLength,
      contentRange: range ? result.ContentRange : undefined,
    };
  }

  async getBuffer(key: string): Promise<Buffer> {
    const { body } = await this.get(key);
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  }
}
