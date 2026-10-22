import os from 'node:os';

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * URLs por las que el celular puede llegar al servidor dentro de la red local. Si la compu no tiene
 * IPs privadas (por ejemplo, solo una de CGNAT), se usan las IPv4 no internas que no sean link-local.
 */
export function getLanUrls(port: number, ifaces = os.networkInterfaces()): string[] {
  const candidates: string[] = [];
  for (const list of Object.values(ifaces)) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) {
        candidates.push(iface.address);
      }
    }
  }
  const privateIps = candidates.filter(isPrivateIPv4);
  return (privateIps.length ? privateIps : candidates).map((ip) => `http://${ip}:${port}`);
}
