import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
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

function send(reply: FastifyReply, status: number, code: ErrorCode, message: string) {
  return reply.status(status).send({ error: { code, message } });
}

export function errorHandler(err: FastifyError | Error, _req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof HttpError) return send(reply, err.status, err.code, err.message);
  const status = (err as FastifyError).statusCode;
  if (status && status >= 400 && status < 500) return send(reply, status, 'bad_request', err.message);
  reply.log.error(err);
  return send(reply, 500, 'internal', 'Error interno del servidor');
}

export function notFoundHandler(_req: FastifyRequest, reply: FastifyReply) {
  return send(reply, 404, 'not_found', 'Ruta inexistente');
}

/** Valida con zod; si falla, 400 con el primer mensaje. */
/** Parámetro de ruta entero (`:id`), o 400. */
export function intParam(value: string | undefined, name: string): number {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new HttpError(400, 'bad_request', `${name} inválido`);
  return n;
}

export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw new HttpError(400, 'bad_request', `${where}${issue?.message ?? 'Datos inválidos'}`);
  }
  return result.data;
}
