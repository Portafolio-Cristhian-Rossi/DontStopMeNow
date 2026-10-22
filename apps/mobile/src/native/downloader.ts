import { DownloadTask, File } from 'expo-file-system';
import { UnauthorizedError } from '../core/http.ts';
import type { Downloader } from '../core/types.ts';

/**
 * Descargas con DownloadTask. Al abortar la señal se pausa y se devuelve el estado (`savable`)
 * para retomar después, incluso si la app se cerró.
 */
export function createDownloader(): Downloader {
  return {
    async download({ url, headers, dest, resumeState, onProgress, signal }) {
      if (signal.aborted && resumeState) return { status: 'paused', state: resumeState };
      const options = { headers, onProgress: (p: { bytesWritten: number }) => onProgress(p.bytesWritten) };
      const task = resumeState
        ? DownloadTask.fromSavable(JSON.parse(resumeState), options)
        : File.createDownloadTask(url, new File(dest), options);
      // Pausar solo tiene sentido (y solo es válido) mientras la descarga está activa.
      const onAbort = () => {
        if (task.state === 'active') task.pause();
      };
      signal.addEventListener('abort', onAbort);
      try {
        const run = resumeState ? task.resumeAsync() : task.downloadAsync();
        if (signal.aborted) onAbort();
        const file = await run;
        if (file === null) return { status: 'paused', state: JSON.stringify(task.savable()) };
        return { status: 'done' };
      } catch (err) {
        if (err instanceof Error && /HTTP 401|status: 401/.test(err.message)) {
          throw new UnauthorizedError('El servidor revocó este celular');
        }
        throw err;
      } finally {
        signal.removeEventListener('abort', onAbort);
      }
    },
  };
}
