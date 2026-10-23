import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'server',
    // Los tests de descargas lanzan muchos procesos de Node (el yt-dlp falso); con la máquina ocupada, el primer
    // test de un archivo que arma la app entera puede pasar los 5 s por defecto.
    testTimeout: 20_000,
  },
});
