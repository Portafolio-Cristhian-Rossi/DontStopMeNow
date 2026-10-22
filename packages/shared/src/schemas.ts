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
