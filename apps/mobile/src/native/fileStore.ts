import { Directory, File, FileMode, Paths } from 'expo-file-system';
import type { FileStore } from '../core/types.ts';

/** Archivos de música en el almacenamiento privado de la app (no los ven otros reproductores). */
export function createFileStore(): FileStore {
  const dir = new Directory(Paths.document, 'music');
  if (!dir.exists) dir.create({ intermediates: true });
  const covers = new Directory(Paths.document, 'covers');
  if (!covers.exists) covers.create({ intermediates: true });

  return {
    musicDir: dir.uri.replace(/\/+$/, ''),
    coversDir: covers.uri.replace(/\/+$/, ''),
    list: (path) => {
      const folder = new Directory(path);
      return folder.exists
        ? folder
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
    freeBytes: () => Paths.availableDiskSpace,
  };
}
