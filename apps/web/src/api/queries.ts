import { useQuery } from '@tanstack/react-query';
import { api } from './client.ts';

export const queryKeys = {
  catalog: ['catalog'],
  roots: ['roots'],
  issues: ['issues'],
  devices: ['devices'],
  ytdlp: ['ytdlp'],
  downloadJobs: ['download-jobs'],
  ytSources: ['yt-sources'],
} as const;

export const useCatalog = () => useQuery({ queryKey: queryKeys.catalog, queryFn: api.catalog });
export const useRoots = () => useQuery({ queryKey: queryKeys.roots, queryFn: api.roots });
export const useIssues = () => useQuery({ queryKey: queryKeys.issues, queryFn: api.issues });
export const useDevices = (opts: { refetchInterval?: number } = {}) =>
  useQuery({ queryKey: queryKeys.devices, queryFn: api.devices, ...opts });
export const useYtDlp = () => useQuery({ queryKey: queryKeys.ytdlp, queryFn: api.ytdlpStatus });
export const useDownloadJobs = () =>
  useQuery({ queryKey: queryKeys.downloadJobs, queryFn: api.downloadJobs });
export const useYtSources = () => useQuery({ queryKey: queryKeys.ytSources, queryFn: api.ytSources });
