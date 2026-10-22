import { Directory, File, FileMode, Paths } from 'expo-file-system';
import type { FileStore } from '../core/types.ts';

/** Archivos de música en el almacenamiento privado de la app (no los ven otros reproductores). */
export function createFileStore(): FileStore {
  const dir = new Directory(Paths.document, 'music');
  if (!dir.exists) dir.create({ intermediates: true });

  return {
    musicDir: dir.uri.replace(/\/+$/, ''),
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
    freeBytes: () => Paths.availableDiskSpace,
  };
}
