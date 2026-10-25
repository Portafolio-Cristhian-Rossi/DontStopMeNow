import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { readableName } from '../core/fileNames.ts';
import type { FileStore, PlaceableTrack } from '../core/types.ts';

/** Las copias a una carpeta elegida se hacen por partes para no cargar la canción entera en memoria. */
const CHUNK = 1024 * 1024;
/**
 * Tipo genérico a propósito: con un tipo de audio, Android puede agregarle una segunda extensión al nombre
 * ("x.m4a.mp4") si no coincide con la que espera; así deja el nombre tal cual y deduce el tipo por la extensión.
 */
const ANY_TYPE = 'application/octet-stream';

async function copyInChunks(from: File, to: File): Promise<void> {
  const total = from.size ?? 0;
  const src = from.open(FileMode.ReadOnly);
  try {
    // Las carpetas elegidas (SAF) no admiten lectura y escritura a la vez: solo escritura.
    const dest = to.open(FileMode.WriteOnly);
    try {
      for (let done = 0; done < total;) {
        const chunk = await src.readBytes(Math.min(CHUNK, total - done));
        if (chunk.length === 0) break;
        await dest.writeBytes(chunk);
        done += chunk.length;
      }
    } finally {
      dest.close();
    }
  } finally {
    src.close();
  }
}

/**
 * Archivos de música. Las descargas siempre se bajan al almacenamiento privado de la app (ahí se retoman y se
 * verifican) y después van al destino: esa misma carpeta privada, o la carpeta que eligió el usuario (por
 * ejemplo en la tarjeta SD) si `folder()` devuelve su dirección.
 */
export function createFileStore(folder: () => string | null): FileStore {
  const dir = new Directory(Paths.document, 'music');
  if (!dir.exists) dir.create({ intermediates: true });
  const covers = new Directory(Paths.document, 'covers');
  if (!covers.exists) covers.create({ intermediates: true });
  const musicDir = dir.uri.replace(/\/+$/, '');

  /** Archivo nuevo y vacío en el destino actual. En la carpeta elegida, Android resuelve los nombres repetidos. */
  function createInTarget(track: PlaceableTrack): File {
    const target = folder();
    if (target) return new Directory(target).createFile(readableName(track), ANY_TYPE);
    const file = new File(dir, `${track.id}.${track.format}`);
    if (file.exists) file.delete();
    return file;
  }

  async function copyToTarget(path: string, track: PlaceableTrack): Promise<string> {
    const dest = createInTarget(track);
    try {
      await copyInChunks(new File(path), dest);
    } catch (err) {
      if (dest.exists) dest.delete();
      throw err;
    }
    return dest.uri;
  }

  return {
    musicDir,
    coversDir: covers.uri.replace(/\/+$/, ''),
    list: (path) => {
      const d = new Directory(path);
      return d.exists
        ? d
            .list()
            .filter((e) => e instanceof File)
            .map((e) => e.name)
        : [];
    },
    exists: (path) => new File(path).exists,
    size: (path) => new File(path).size ?? 0,
    async read(path, offset, length) {
      const handle = new File(path).open(FileMode.ReadOnly);
      try {
        handle.offset = offset;
        return await handle.readBytes(length);
      } finally {
        handle.close();
      }
    },
    move(from, to) {
      const target = new File(to);
      if (target.exists) target.delete();
      new File(from).moveSync(target);
    },
    remove(path) {
      const file = new File(path);
      if (file.exists) file.delete();
    },
    async place(temp, track) {
      if (!folder()) {
        const dest = new File(dir, `${track.id}.${track.format}`);
        if (dest.exists) dest.delete();
        new File(temp).moveSync(dest);
        return dest.uri;
      }
      const placed = await copyToTarget(temp, track);
      new File(temp).delete();
      return placed;
    },
    copyToTarget,
    isInTarget(path) {
      const target = folder()?.replace(/\/+$/, '');
      return target ? path === target || path.startsWith(`${target}/`) : path.startsWith(`${musicDir}/`);
    },
    // Android no informa el espacio libre de una carpeta elegida.
    freeBytes: () => (folder() ? null : Paths.availableDiskSpace),
    tempFreeBytes: () => Paths.availableDiskSpace,
  };
}

/** Abre el selector de carpetas de Android. Devuelve la dirección elegida, o null si se canceló. */
export async function pickFolder(): Promise<string | null> {
  try {
    const picked = await Directory.pickDirectoryAsync();
    return picked.uri;
  } catch {
    return null;
  }
}
