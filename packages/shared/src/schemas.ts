import { z } from 'zod';

const name = (max: number) => z.string().trim().min(1).max(max);

export const AudioFormatSchema = z.enum(['mp3', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'wav']);
export type AudioFormat = z.infer<typeof AudioFormatSchema>;

export const TrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  albumId: z.string(),
  trackNo: z.number().int().nullable(),
  discNo: z.number().int().nullable(),
  durationMs: z.number().int(),
  size: z.number().int(),
  format: AudioFormatSchema,
  fingerprint: z.string(),
  coverId: z.string().nullable(),
  available: z.boolean(),
  /** Cuándo se marcó como favorita (ms), o null. Opcional: los servidores viejos no lo mandan. */
  favoritedAt: z.number().int().nullable().optional(),
});
export type Track = z.infer<typeof TrackSchema>;

export const AlbumSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  year: z.number().int().nullable(),
  coverId: z.string().nullable(),
  trackIds: z.array(z.string()),
});
export type Album = z.infer<typeof AlbumSchema>;

export const PlaylistSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['manual', 'folder']),
  folder: z.object({ rootId: z.number().int(), relPath: z.string() }).nullable(),
  trackIds: z.array(z.string()),
});
export type Playlist = z.infer<typeof PlaylistSchema>;

export const CatalogSchema = z.object({
  serverId: z.string(),
  revision: z.number().int(),
  tracks: z.array(TrackSchema),
  albums: z.array(AlbumSchema),
  playlists: z.array(PlaylistSchema),
});
export type Catalog = z.infer<typeof CatalogSchema>;

export const ErrorCodeSchema = z.enum([
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'range_not_satisfiable',
  'internal',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({ code: ErrorCodeSchema, message: z.string() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const PairRequestSchema = z.object({
  code: z.string().min(1).max(32),
  deviceName: name(64),
});
export type PairRequest = z.infer<typeof PairRequestSchema>;

export const PairResponseSchema = z.object({
  token: z.string(),
  serverId: z.string(),
  serverName: z.string(),
});
export type PairResponse = z.infer<typeof PairResponseSchema>;

export const QrPayloadSchema = z.object({
  v: z.literal(1),
  serverId: z.string(),
  urls: z.array(z.url()).min(1),
  code: z.string(),
});
export type QrPayload = z.infer<typeof QrPayloadSchema>;

export const PairingCodeResponseSchema = z.object({
  code: z.string(),
  expiresAt: z.number().int(),
  qrPayload: z.string(),
});
export type PairingCodeResponse = z.infer<typeof PairingCodeResponseSchema>;

export const CreatePlaylistRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('manual'), name: name(100), trackIds: z.array(z.string()).optional() }),
  z.object({
    type: z.literal('folder'),
    name: name(100),
    rootId: z.number().int(),
    folderRelPath: z.string(),
  }),
]);
export type CreatePlaylistRequest = z.infer<typeof CreatePlaylistRequestSchema>;

export const UpdatePlaylistRequestSchema = z
  .object({ name: name(100).optional(), trackIds: z.array(z.string()).optional() })
  .refine((r) => r.name !== undefined || r.trackIds !== undefined, {
    message: 'Hay que indicar name o trackIds',
  });
export type UpdatePlaylistRequest = z.infer<typeof UpdatePlaylistRequestSchema>;

/**
 * Lista nueva creada desde el celular: siempre manual y con el id que genera el celular, así una lista creada sin
 * conexión ya tiene su id definitivo y reintentar el envío no la duplica.
 */
export const DeviceCreatePlaylistRequestSchema = z.object({
  id: z.uuid(),
  name: name(100),
  trackIds: z.array(z.string()).max(10_000).default([]),
});
export type DeviceCreatePlaylistRequest = z.infer<typeof DeviceCreatePlaylistRequestSchema>;

export const RenamePlaylistRequestSchema = z.object({ name: name(100) });
export type RenamePlaylistRequest = z.infer<typeof RenamePlaylistRequestSchema>;

export const AddTracksRequestSchema = z.object({ trackIds: z.array(z.string()).min(1).max(10_000) });
export type AddTracksRequest = z.infer<typeof AddTracksRequestSchema>;

export const RootSchema = z.object({
  id: z.number().int(),
  path: z.string(),
  status: z.enum(['online', 'offline']),
});
export type Root = z.infer<typeof RootSchema>;

export const AddRootRequestSchema = z.object({ path: z.string().min(1) });
export type AddRootRequest = z.infer<typeof AddRootRequestSchema>;

export const BrowseResponseSchema = z.object({
  rootId: z.number().int(),
  path: z.string(),
  folders: z.array(z.string()),
});
export type BrowseResponse = z.infer<typeof BrowseResponseSchema>;

/** Carpeta del sistema (fuera de las raíces): nombre visible y ruta absoluta. */
export const FsFolderSchema = z.object({ name: z.string(), path: z.string() });
export type FsFolder = z.infer<typeof FsFolderSchema>;

export const FsBrowseResponseSchema = z.object({
  path: z.string(),
  parent: z.string().nullable(),
  folders: z.array(FsFolderSchema),
});
export type FsBrowseResponse = z.infer<typeof FsBrowseResponseSchema>;

export const DeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number().int(),
  lastSeenAt: z.number().int().nullable(),
});
export type Device = z.infer<typeof DeviceSchema>;

export const ScanIssueSchema = z.object({
  path: z.string(),
  error: z.string(),
  detectedAt: z.number().int(),
});
export type ScanIssue = z.infer<typeof ScanIssueSchema>;

export const ScanStatusSchema = z.object({
  running: z.boolean(),
  processed: z.number().int(),
  total: z.number().int(),
});
export type ScanStatus = z.infer<typeof ScanStatusSchema>;

// --- Descargas desde YouTube ---

export const YtDlpStatusSchema = z.object({
  path: z.string().nullable(),
  version: z.string().nullable(),
  ffmpeg: z.boolean(),
  suggestedPath: z.string().nullable(),
  error: z.string().nullable(),
});
export type YtDlpStatus = z.infer<typeof YtDlpStatusSchema>;

export const SetYtDlpPathRequestSchema = z.object({ path: z.string().min(1) });
export type SetYtDlpPathRequest = z.infer<typeof SetYtDlpPathRequestSchema>;

export const YtDlpUpdateResponseSchema = z.object({ version: z.string(), output: z.string() });
export type YtDlpUpdateResponse = z.infer<typeof YtDlpUpdateResponseSchema>;

export const PreviewRequestSchema = z.object({
  url: z.string().refine((u) => /^https?:\/\//i.test(u.trim()), {
    message: 'El link tiene que empezar con http:// o https://',
  }),
});
export type PreviewRequest = z.infer<typeof PreviewRequestSchema>;

export const PreviewEntrySchema = z.object({
  videoId: z.string(),
  url: z.string(),
  title: z.string(),
  channel: z.string().nullable(),
  durationSec: z.number().nullable(),
  position: z.number().int().nullable(),
  unavailable: z.boolean(),
});
export type PreviewEntry = z.infer<typeof PreviewEntrySchema>;

export const AnalyzedEntrySchema = PreviewEntrySchema.extend({
  duplicateOf: z.string().nullable(),
  inLibrary: z.string().nullable(),
  versionGroup: z.string().nullable(),
  versionTags: z.array(z.string()),
  alreadyDownloaded: z.boolean(),
  selected: z.boolean(),
});
export type AnalyzedEntry = z.infer<typeof AnalyzedEntrySchema>;

export const DownloadKindSchema = z.enum(['playlist', 'video']);
export type DownloadKind = z.infer<typeof DownloadKindSchema>;

export const PreviewSchema = z.object({
  kind: DownloadKindSchema,
  ytPlaylistId: z.string().nullable(),
  title: z.string(),
  url: z.string(),
  playlistSize: z.number().int(),
  sourceId: z.number().int().nullable(),
  destination: z.object({ rootId: z.number().int(), folder: z.string() }).nullable(),
  entries: z.array(AnalyzedEntrySchema),
});
export type Preview = z.infer<typeof PreviewSchema>;

export const EnqueueRequestSchema = z.object({
  url: z.string(),
  title: z.string(),
  kind: DownloadKindSchema,
  ytPlaylistId: z.string().nullable(),
  playlistSize: z.number().int().min(1),
  rootId: z.number().int(),
  folder: z.string(),
  items: z
    .array(z.object({ videoId: z.string(), position: z.number().int().nullable(), title: z.string() }))
    .min(1),
});
export type EnqueueRequest = z.infer<typeof EnqueueRequestSchema>;

export const DownloadJobStatusSchema = z.enum(['pending', 'running', 'paused', 'done', 'cancelled']);
export type DownloadJobStatus = z.infer<typeof DownloadJobStatusSchema>;

export const DownloadItemStatusSchema = z.enum(['pending', 'downloading', 'done', 'failed', 'cancelled']);
export type DownloadItemStatus = z.infer<typeof DownloadItemStatusSchema>;

export const DownloadItemSchema = z.object({
  videoId: z.string(),
  position: z.number().int().nullable(),
  title: z.string(),
  status: DownloadItemStatusSchema,
  error: z.string().nullable(),
  filePath: z.string().nullable(),
});
export type DownloadItem = z.infer<typeof DownloadItemSchema>;

export const DownloadJobSchema = z.object({
  id: z.number().int(),
  sourceId: z.number().int().nullable(),
  url: z.string(),
  title: z.string(),
  rootId: z.number().int(),
  folder: z.string(),
  status: DownloadJobStatusSchema,
  pauseReason: z.string().nullable(),
  createdAt: z.number().int(),
  finishedAt: z.number().int().nullable(),
  items: z.array(DownloadItemSchema),
});
export type DownloadJob = z.infer<typeof DownloadJobSchema>;

export const YtSourceSchema = z.object({
  id: z.number().int(),
  url: z.string(),
  ytPlaylistId: z.string(),
  title: z.string(),
  rootId: z.number().int(),
  folder: z.string(),
  playlistId: z.string().nullable(),
  downloaded: z.number().int(),
  createdAt: z.number().int(),
  lastCheckedAt: z.number().int().nullable(),
});
export type YtSource = z.infer<typeof YtSourceSchema>;

export const DownloadEventSchema = z.object({
  jobId: z.number().int(),
  status: DownloadJobStatusSchema,
  done: z.number().int(),
  failed: z.number().int(),
  total: z.number().int(),
  current: z
    .object({
      videoId: z.string(),
      title: z.string(),
      stage: z.enum(['download', 'convert']),
      percent: z.number().nullable(),
    })
    .nullable(),
});
export type DownloadEvent = z.infer<typeof DownloadEventSchema>;
