import nodePath from 'node:path';

/** Ruta relativa a la raíz, siempre con "/" como separador. */
export function toRelPath(rootPath: string, absPath: string, p: nodePath.PlatformPath = nodePath): string {
  const rel = p.relative(rootPath, absPath);
  if (rel.startsWith('..') || p.isAbsolute(rel)) {
    throw new Error(`La ruta ${absPath} no está dentro de ${rootPath}`);
  }
  return rel.split(p.sep).join('/');
}

/** ¿La ruta relativa está dentro de la carpeta relativa (o es ella misma)? */
export function isUnderRelDir(relPath: string, relDir: string): boolean {
  return relDir === '' || relPath === relDir || relPath.startsWith(relDir + '/');
}

/**
 * Normaliza una carpeta relativa escrita por el usuario ("\\" o "/", con o sin barras en los extremos)
 * y la resuelve dentro de la raíz. Devuelve null si contiene ".." o queda fuera de la raíz.
 */
export function resolveRelDir(rootPath: string, relDir: string): { abs: string; rel: string } | null {
  const rel = relDir.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
  if (rel.split('/').includes('..')) return null;
  const abs = rel ? nodePath.resolve(rootPath, ...rel.split('/')) : rootPath;
  try {
    return { abs, rel: toRelPath(rootPath, abs) };
  } catch {
    return null;
  }
}
