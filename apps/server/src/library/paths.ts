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
