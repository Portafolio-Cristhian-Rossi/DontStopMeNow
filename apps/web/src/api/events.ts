import type { ScanStatus } from '@dsmn/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState } from 'react';
import { queryKeys } from './queries.ts';

const IDLE: ScanStatus = { running: false, processed: 0, total: 0 };

/** Escucha /api/admin/events: progreso del escaneo y refresco de datos cuando cambia la revisión. */
export function useServerEvents(): ScanStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ScanStatus>(IDLE);

  useEffect(() => {
    const source = new EventSource('/api/admin/events');
    const onScan = (e: MessageEvent) => setStatus(JSON.parse(e.data) as ScanStatus);
    const onRevision = () => {
      for (const key of [queryKeys.catalog, queryKeys.roots, queryKeys.issues]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    };
    source.addEventListener('scan', onScan);
    source.addEventListener('revision', onRevision);
    return () => {
      source.removeEventListener('scan', onScan);
      source.removeEventListener('revision', onRevision);
      source.close();
    };
  }, [queryClient]);

  return status;
}

export const ScanStatusContext = createContext<ScanStatus>(IDLE);

export const useScanStatus = () => useContext(ScanStatusContext);
