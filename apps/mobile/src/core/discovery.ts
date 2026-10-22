import { pickReachableUrl } from './pairing.ts';
import type { Discovery, FetchLike, PairedServer } from './types.ts';

/**
 * URL actual del servidor: la guardada si responde; si no (la compu cambió de IP), la que
 * anuncia por mDNS con el mismo serverId. null si no se encuentra.
 */
export async function resolveServerUrl(
  server: PairedServer,
  deps: { fetch: FetchLike; discovery: Discovery },
): Promise<string | null> {
  if (await pickReachableUrl([server.url], deps.fetch, 3000)) return server.url;
  const found = await deps.discovery.find(server.serverId, 5000);
  if (found && (await pickReachableUrl([found], deps.fetch, 3000))) return found;
  return null;
}
