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
  /** Servidores DontStopMeNow que se anuncian en la red durante `timeoutMs`. */
  list(timeoutMs: number): Promise<{ serverId: string; name: string; url: string }[]>;
}

export type SqlValue = string | number | null;

/** Base SQL síncrona mínima (la implementan expo-sqlite en el celular y node:sqlite en los tests). */
export interface SqlDb {
  exec(sql: string): void;
  run(sql: string, ...params: SqlValue[]): void;
  all<T>(sql: string, ...params: SqlValue[]): T[];
  first<T>(sql: string, ...params: SqlValue[]): T | null;
}

/** Archivos de la app (en el celular, el almacenamiento privado; en los tests, memoria). */
export interface FileStore {
  musicDir: string;
  coversDir: string;
  exists(path: string): boolean;
  /** Nombres de los archivos de una carpeta. */
  list(dir: string): string[];
  size(path: string): number;
  read(path: string, offset: number, length: number): Promise<Uint8Array>;
  move(from: string, to: string): void;
  remove(path: string): void;
  freeBytes(): number;
}

/**
 * Descarga un archivo a `dest`. Si `signal` se aborta, pausa y devuelve el estado para retomar.
 * Lanza en errores de red o HTTP (401 → UnauthorizedError).
 */
export interface Downloader {
  download(req: {
    url: string;
    headers: Record<string, string>;
    dest: string;
    resumeState?: string;
    onProgress(bytes: number): void;
    signal: AbortSignal;
  }): Promise<{ status: 'done' } | { status: 'paused'; state: string }>;
}

export type EngineLoop = 'none' | 'single' | 'all';

/** Motor de audio con cola nativa (en el celular, AudioPlaylist de expo-audio). */
export interface PlayerEngine {
  load(sources: { uri: string }[], startIndex: number, positionMs: number, autoplay: boolean): void;
  play(): void;
  pause(): void;
  skipTo(index: number): void;
  seekTo(ms: number): void;
  setLoop(mode: EngineLoop): void;
  insert(source: { uri: string }, index: number): void;
  add(source: { uri: string }): void;
  remove(index: number): void;
  setNowPlaying(meta: { title: string; artist: string; albumTitle: string; artworkUrl?: string }): void;
  /** Quita los controles de la notificación y la pantalla de bloqueo. */
  clearNowPlaying(): void;
  status(): EngineStatus;
  onTrackChanged(cb: (index: number) => void): () => void;
  onStatus(cb: (status: EngineStatus) => void): () => void;
}

/** `ended`: terminó la última canción de la cola (sin repetir). */
export type EngineStatus = {
  index: number;
  positionMs: number;
  durationMs: number;
  playing: boolean;
  ended: boolean;
};
