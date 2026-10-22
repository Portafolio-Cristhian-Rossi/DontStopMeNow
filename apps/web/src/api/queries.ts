import { useQuery } from '@tanstack/react-query';
import { api } from './client.ts';

export const queryKeys = {
  catalog: ['catalog'],
  roots: ['roots'],
  issues: ['issues'],
  devices: ['devices'],
} as const;

export const useCatalog = () => useQuery({ queryKey: queryKeys.catalog, queryFn: api.catalog });
export const useRoots = () => useQuery({ queryKey: queryKeys.roots, queryFn: api.roots });
export const useIssues = () => useQuery({ queryKey: queryKeys.issues, queryFn: api.issues });
export const useDevices = () => useQuery({ queryKey: queryKeys.devices, queryFn: api.devices });
