import type { DocumentRecord } from '@oneohm/api-contracts';
import { ApiError, describeError, type UploadableFile, uploadFile } from '@oneohm/mobile-ui';
import { useQueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { API_BASE_URL, currentToken, keys } from '@/api/api';
import { UPLOADS } from '@/copy/uploads';
import { useCurrentUser } from '@/session/session-provider';
import { geotagFields } from './geotag-fields';
import {
  afterFailure,
  type Failure,
  type Geotag,
  nextWake,
  type QueuedUpload,
  readyToSend,
  retriedNow,
  type UploadKind,
  uploadId,
  wakeAll,
} from './queue-logic';
import { dropFile, keepBytes, keepFile, loadQueue, saveQueue, uploadableFor } from './upload-store';

/** A file to queue: picked from the camera, gallery or files, or drawn (bytes). */
export type NewUpload = {
  readonly taskId: string;
  readonly kind: UploadKind;
  readonly category: string;
  readonly name: string;
  readonly type: string;
  readonly geotag?: Geotag | null;
} & ({ readonly file: UploadableFile } | { readonly bytes: Uint8Array });

interface UploadQueueValue {
  readonly items: readonly QueuedUpload[];
  readonly progress: Readonly<Record<string, number>>;
  readonly add: (uploads: readonly NewUpload[]) => Promise<void>;
  readonly retry: (id: string) => void;
  readonly discard: (id: string) => void;
}

const UploadQueueContext = createContext<UploadQueueValue | null>(null);

function failureOf(error: unknown): Failure {
  if (error instanceof ApiError) return { status: error.status, message: describeError(error) };
  return { status: 0, message: describeError(error) };
}

async function keep(id: string, upload: NewUpload): Promise<string> {
  return 'bytes' in upload ? keepBytes(id, upload.bytes, upload.type) : keepFile(id, upload.file);
}

/**
 * Evidence waiting to reach OneOhm (PRD 4.4: saved on the device and uploaded with
 * automatic retry until it succeeds). The queue is kept on the phone, so it carries on
 * after the app is closed; it sends on start, when the phone is back online, when the
 * app comes back to the front, and on a backoff timer in between.
 */
export function UploadQueueProvider({ children }: { readonly children: ReactNode }) {
  const user = useCurrentUser();
  const client = useQueryClient();
  const [items, setItems] = useState<readonly QueuedUpload[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState<Readonly<Record<string, number>>>({});
  const sending = useRef(new Set<string>());

  useEffect(() => {
    void loadQueue().then((saved) => {
      setItems((current) => [...saved, ...current]);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) void saveQueue(items);
  }, [items, loaded]);

  const wake = useCallback(() => setItems((current) => wakeAll(current, Date.now())), []);
  useEffect(() => {
    const network = Network.addNetworkStateListener((state) => {
      if (state.isConnected !== false) wake();
    });
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') wake();
    });
    return () => {
      network.remove();
      app.remove();
    };
  }, [wake]);

  const finish = useCallback(
    async (item: QueuedUpload) => {
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      await dropFile(item);
      await client.invalidateQueries({ queryKey: keys.task(item.taskId) });
      await client.invalidateQueries({ queryKey: keys.tasks });
    },
    [client],
  );

  const fail = useCallback((item: QueuedUpload, failure: Failure) => {
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? afterFailure(entry, failure, Date.now()) : entry,
      ),
    );
  }, []);

  const send = useCallback(
    async (item: QueuedUpload) => {
      sending.current.add(item.id);
      const settle = () => {
        sending.current.delete(item.id);
        setProgress(({ [item.id]: _done, ...rest }) => rest);
      };
      const file = await uploadableFor(item);
      if (!file) {
        settle();
        fail(item, { status: 410, message: UPLOADS.missingFile });
        return;
      }
      try {
        await uploadFile<DocumentRecord>({
          url: `${API_BASE_URL.replace(/\/+$/, '')}/v1/documents`,
          token: currentToken(),
          file,
          fields: {
            category: item.category,
            taskId: item.taskId,
            name: item.name,
            ...geotagFields(item.geotag),
          },
          onProgress: (fraction) => setProgress((current) => ({ ...current, [item.id]: fraction })),
        });
        settle();
        await finish(item);
      } catch (error) {
        settle();
        fail(item, failureOf(error));
      }
    },
    [fail, finish],
  );

  useEffect(() => {
    if (!loaded) return;
    const now = Date.now();
    const options = { userId: user.id, now, sending: sending.current };
    for (const item of readyToSend(items, options)) void send(item);
    const due = nextWake(items, user.id, now);
    if (due === null) return;
    // A fresh array re-runs this pass when the soonest retry falls due.
    const timer = setTimeout(() => setItems((current) => [...current]), Math.max(due - now, 250));
    return () => clearTimeout(timer);
  }, [items, loaded, user.id, send]);

  const add = useCallback(
    async (uploads: readonly NewUpload[]) => {
      const kept: QueuedUpload[] = [];
      for (const upload of uploads) {
        const now = Date.now();
        const id = uploadId(now);
        kept.push({
          id,
          userId: user.id,
          taskId: upload.taskId,
          kind: upload.kind,
          category: upload.category,
          name: upload.name,
          type: upload.type,
          uri: await keep(id, upload),
          geotag: upload.geotag ?? null,
          attempts: 0,
          error: null,
          autoRetry: false,
          retryAt: null,
          createdAt: now,
        });
      }
      setItems((current) => [...current, ...kept]);
    },
    [user.id],
  );

  const value = useMemo<UploadQueueValue>(
    () => ({
      items: items.filter((item) => item.userId === user.id),
      progress,
      add,
      retry: (id) =>
        setItems((current) => current.map((item) => (item.id === id ? retriedNow(item) : item))),
      discard: (id) => {
        const item = items.find((entry) => entry.id === id);
        setItems((current) => current.filter((entry) => entry.id !== id));
        if (item) void dropFile(item);
      },
    }),
    [items, progress, add, user.id],
  );
  return <UploadQueueContext value={value}>{children}</UploadQueueContext>;
}

export function useUploadQueue(): UploadQueueValue {
  const value = use(UploadQueueContext);
  if (!value) throw new Error('useUploadQueue needs UploadQueueProvider');
  return value;
}
