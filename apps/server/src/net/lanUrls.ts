import os from 'node:os';

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** URLs por las que el celular puede llegar al servidor dentro de la red local. */
export function getLanUrls(port: number, ifaces = os.networkInterfaces()): string[] {
  const urls: string[] = [];
  for (const list of Object.values(ifaces)) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal && isPrivateIPv4(iface.address)) {
        urls.push(`http://${iface.address}:${port}`);
      }
    }
  }
  return urls;
}
