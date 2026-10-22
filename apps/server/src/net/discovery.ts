import { MDNS_SERVICE_TYPE } from '@dsmn/shared';

interface BonjourLike {
  publish(opts: { name: string; type: string; port: number; txt: Record<string, string> }): {
    stop?: CallableFunction;
  };
}

/** Anuncia el servidor en la red local por mDNS (_dontstopmenow._tcp). */
export function publishService(opts: {
  bonjour: BonjourLike;
  serverId: string;
  serverName: string;
  port: number;
}): { stop(): void } {
  const service = opts.bonjour.publish({
    name: `DontStopMeNow (${opts.serverName})`,
    type: MDNS_SERVICE_TYPE,
    port: opts.port,
    txt: { id: opts.serverId, v: '1' },
  });
  return { stop: () => service.stop?.() };
}
