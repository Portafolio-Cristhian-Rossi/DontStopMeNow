import { describe, expect, it } from 'vitest';
import { folderLabel, readableName } from '../src/core/fileNames.ts';

describe('readableName', () => {
  it('arma "Título - Artista.ext" sin caracteres prohibidos', () => {
    expect(readableName({ id: 't1', title: 'AC/DC: Live?', artist: 'AC/DC', format: 'flac' })).toBe(
      'AC DC Live - AC DC.flac',
    );
  });

  it('sin título ni artista usa el id, y corta los nombres muy largos', () => {
    expect(readableName({ id: 't1', title: '  ', artist: '', format: 'mp3' })).toBe('t1.mp3');
    const long = readableName({ id: 't1', title: 'a'.repeat(300), artist: 'b', format: 'mp3' });
    expect(long).toBe(`${'a'.repeat(120)}.mp3`);
  });
});

describe('folderLabel', () => {
  it('muestra la tarjeta SD y la ruta', () => {
    expect(
      folderLabel('content://com.android.externalstorage.documents/tree/1234-ABCD%3AMusica%2FRock'),
    ).toBe('Tarjeta SD › Musica › Rock');
  });

  it('distingue la memoria interna y la raíz', () => {
    expect(folderLabel('content://com.android.externalstorage.documents/tree/primary%3AMusic')).toBe(
      'Memoria interna › Music',
    );
    expect(folderLabel('content://com.android.externalstorage.documents/tree/1234-ABCD%3A')).toBe(
      'Tarjeta SD',
    );
  });

  it('una dirección rara no rompe', () => {
    expect(folderLabel('file:///algo')).toBe('Carpeta elegida');
  });
});
