/** Subconjunto de fetch que usa la app (el de React Native lo cumple). */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ status: number; headers: { get(name: string): string | null }; json(): Promise<unknown> }>;

/** Servidor vinculado, tal como se guarda en el celular. */
export interface PairedServer {
  serverId: string;
  name: string;
  url: string;
  token: string;
}

/** Búsqueda del servidor en la red local por mDNS. Devuelve `http://<ipv4>:<puerto>` o null. */
export interface Discovery {
  find(serverId: string, timeoutMs: number): Promise<string | null>;
}

export type SqlValue = string | number | null;

/** Base SQL síncrona mínima (la implementan expo-sqlite en el celular y node:sqlite en los tests). */
export interface SqlDb {
  exec(sql: string): void;
  run(sql: string, ...params: SqlValue[]): void;
  all<T>(sql: string, ...params: SqlValue[]): T[];
  first<T>(sql: string, ...params: SqlValue[]): T | null;
}
