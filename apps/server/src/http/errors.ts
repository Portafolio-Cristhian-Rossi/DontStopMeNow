import type { ErrorCode } from '@dsmn/shared';

/** Error con status HTTP y código de la API; lo traduce el errorHandler. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
