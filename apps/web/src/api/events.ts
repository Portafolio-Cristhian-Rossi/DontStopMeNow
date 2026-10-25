import type { DownloadEvent, ScanStatus } from '@dsmn/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState } from 'react';
import { queryKeys } from './queries.ts';

const IDLE: ScanStatus = { running: false, processed: 0, total: 0 };

export interface ServerEvents {
  scan: ScanStatus;
  /** Último evento de cada descarga, por id de trabajo. */
  downloads: Record<number, DownloadEvent>;
}

/**
 * Escucha /api/admin/events: progreso del escaneo y de las descargas, y refresco de datos cuando cambia la revisión o
 * cuando una descarga cambia de estado o termina/falla una canción (el porcentaje solo no refresca, para no pedir la
 * cola varias veces por segundo).
 */
export function useServerEvents(): ServerEvents {
  const queryClient = useQueryClient();
  const [scan, setScan] = useState<ScanStatus>(IDLE);
  const [downloads, setDownloads] = useState<Record<number, DownloadEvent>>({});

  useEffect(() => {
    const source = new EventSource('/api/admin/events');
    /** Estado y conteos de cada trabajo: cambian por canción, no con cada porcentaje. */
    const lastSeen = new Map<number, string>();
    const invalidate = (keys: readonly (readonly string[])[]) => {
      for (const key of keys) void queryClient.invalidateQueries({ queryKey: key });
    };
    const onScan = (e: MessageEvent) => setScan(JSON.parse(e.data) as ScanStatus);
    const onRevision = () => invalidate([queryKeys.catalog, queryKeys.roots, queryKeys.issues]);
    const onDownload = (e: MessageEvent) => {
      const event = JSON.parse(e.data) as DownloadEvent;
      setDownloads((prev) => ({ ...prev, [event.jobId]: event }));
      const seen = `${event.status}:${event.done}:${event.failed}`;
      if (lastSeen.get(event.jobId) !== seen) {
        lastSeen.set(event.jobId, seen);
        invalidate([queryKeys.downloadJobs, queryKeys.ytSources]);
      }
    };
    // Si la conexión se vuelve a abrir, el servidor pudo haberse reiniciado: los datos pueden estar viejos y el
    // código de vinculación en pantalla ya no existe (vive solo en la memoria del servidor).
    let opened = false;
    const onOpen = () => {
      if (opened) {
        invalidate([
          queryKeys.catalog,
          queryKeys.roots,
          queryKeys.issues,
          queryKeys.devices,
          queryKeys.downloadJobs,
          queryKeys.pairingCode,
        ]);
      }
      opened = true;
    };
    source.addEventListener('open', onOpen);
    source.addEventListener('scan', onScan);
    source.addEventListener('revision', onRevision);
    source.addEventListener('download', onDownload);
    return () => {
      source.removeEventListener('open', onOpen);
      source.removeEventListener('scan', onScan);
      source.removeEventListener('revision', onRevision);
      source.removeEventListener('download', onDownload);
      source.close();
    };
  }, [queryClient]);

  return { scan, downloads };
}

export const ScanStatusContext = createContext<ScanStatus>(IDLE);

export const useScanStatus = () => useContext(ScanStatusContext);

export const DownloadProgressContext = createContext<Record<number, DownloadEvent>>({});

export const useDownloadProgress = () => useContext(DownloadProgressContext);
