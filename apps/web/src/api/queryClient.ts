import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './client.ts';

/**
 * Los errores 4xx son respuestas definitivas del servidor (por ejemplo, el 409 de "sin red local"):
 * se muestran enseguida. Los de red o 5xx se reintentan una vez.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}
