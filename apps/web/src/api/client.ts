import type {
  BrowseResponse,
  Catalog,
  CreatePlaylistRequest,
  Device,
  DownloadJob,
  EnqueueRequest,
  ErrorCode,
  FsBrowseResponse,
  FsFolder,
  PairingCodeResponse,
  Playlist,
  Preview,
  Root,
  ScanIssue,
  UpdatePlaylistRequest,
  YtDlpStatus,
  YtDlpUpdateResponse,
  YtSource,
} from '@dsmn/shared';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, 'internal', 'No se pudo conectar con el servidor');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const error = data?.error as { code?: ErrorCode; message?: string } | undefined;
    throw new ApiRequestError(res.status, error?.code ?? 'internal', error?.message ?? `Error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  catalog: () => request<Catalog>('GET', '/api/catalog'),
  roots: () => request<Root[]>('GET', '/api/admin/roots'),
  addRoot: (path: string) => request<Root>('POST', '/api/admin/roots', { path }),
  removeRoot: (id: number) => request<void>('DELETE', `/api/admin/roots/${id}`),
  browse: (rootId: number, path: string) =>
    request<BrowseResponse>(
      'GET',
      `/api/admin/browse?${new URLSearchParams({ rootId: String(rootId), path }).toString()}`,
    ),
  fsPlaces: () => request<FsFolder[]>('GET', '/api/admin/fs/places'),
  fsBrowse: (path: string) =>
    request<FsBrowseResponse>('GET', `/api/admin/fs?${new URLSearchParams({ path }).toString()}`),
  scan: () => request<void>('POST', '/api/admin/scan').then(() => undefined),
  issues: () => request<ScanIssue[]>('GET', '/api/admin/issues'),
  createPlaylist: (req: CreatePlaylistRequest) => request<Playlist>('POST', '/api/admin/playlists', req),
  updatePlaylist: (id: string, req: UpdatePlaylistRequest) =>
    request<Playlist>('PATCH', `/api/admin/playlists/${encodeURIComponent(id)}`, req),
  deletePlaylist: (id: string) => request<void>('DELETE', `/api/admin/playlists/${encodeURIComponent(id)}`),
  pairingCode: () => request<PairingCodeResponse>('POST', '/api/admin/pairing-code'),
  devices: () => request<Device[]>('GET', '/api/admin/devices'),
  revokeDevice: (id: string) => request<void>('DELETE', `/api/admin/devices/${encodeURIComponent(id)}`),
  ytdlpStatus: () => request<YtDlpStatus>('GET', '/api/admin/ytdlp'),
  setYtdlpPath: (path: string) => request<YtDlpStatus>('PUT', '/api/admin/ytdlp', { path }),
  updateYtdlp: () => request<YtDlpUpdateResponse>('POST', '/api/admin/ytdlp/update'),
  preview: (url: string) => request<Preview>('POST', '/api/admin/downloads/preview', { url }),
  enqueue: (req: EnqueueRequest) => request<DownloadJob>('POST', '/api/admin/downloads/jobs', req),
  downloadJobs: () => request<DownloadJob[]>('GET', '/api/admin/downloads/jobs'),
  cancelJob: (id: number) => request<DownloadJob>('POST', `/api/admin/downloads/jobs/${id}/cancel`),
  resumeJob: (id: number) => request<DownloadJob>('POST', `/api/admin/downloads/jobs/${id}/resume`),
  retryJob: (id: number) => request<DownloadJob>('POST', `/api/admin/downloads/jobs/${id}/retry`),
  removeJob: (id: number) => request<void>('DELETE', `/api/admin/downloads/jobs/${id}`),
  ytSources: () => request<YtSource[]>('GET', '/api/admin/downloads/sources'),
  checkSource: (id: number) => request<Preview>('POST', `/api/admin/downloads/sources/${id}/check`),
  forgetSource: (id: number) => request<void>('DELETE', `/api/admin/downloads/sources/${id}`),
};

export const coverUrl = (id: string) => `/api/covers/${encodeURIComponent(id)}`;
