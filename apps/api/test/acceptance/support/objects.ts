import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';

/** The acceptance API's object store, read with the local development keys. */
const client = new S3Client({
  endpoint: process.env.STORAGE_ENDPOINT ?? 'http://127.0.0.1:9120',
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId: 'oneohm-local', secretAccessKey: 'oneohm-local-secret' },
});

/** True when the acceptance bucket still holds this object. */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: 'oneohm-acceptance', Key: key }));
    return true;
  } catch {
    return false;
  }
}
