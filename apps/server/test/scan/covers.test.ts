import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findFolderCover, saveCover } from '../../src/scan/covers.ts';
import { makeDb, tmpDir } from '../helpers/fixtures.ts';

describe('covers', () => {
  it('findFolderCover encuentra Folder.JPG', async () => {
    const dir = await tmpDir();
    await writeFile(join(dir, 'Folder.JPG'), Buffer.from([1, 2, 3]));
    const pic = await findFolderCover(dir);
    expect(pic?.mime).toBe('image/jpeg');
    expect([...pic!.data]).toEqual([1, 2, 3]);
  });

  it('findFolderCover devuelve null si no hay imagen', async () => {
    expect(await findFolderCover(await tmpDir())).toBeNull();
  });

  it('saveCover deduplica por contenido', async () => {
    const db = makeDb();
    const dir = await tmpDir();
    const pic = { mime: 'image/png', data: new Uint8Array([9, 9, 9]) };
    const a = saveCover(db, dir, pic);
    const b = saveCover(db, dir, pic);
    expect(a).toBe(b);
    expect(await readdir(dir)).toEqual([a]);
    expect({ ...db.prepare('SELECT COUNT(*) AS n FROM covers').get() }).toEqual({ n: 1 });
  });
});
