// Empaqueta el servidor en un único archivo CommonJS (dist/bundle/server.cjs).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
export const BUNDLE = `${root}dist/bundle/server.cjs`;

export async function bundleServer() {
  await build({
    entryPoints: [`${root}apps/server/src/entry.ts`],
    outfile: BUNDLE,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    define: { __DSMN_BUNDLED__: 'true' },
    // import.meta solo se usa en la rama de desarrollo, que en el bundle nunca corre.
    logOverride: { 'empty-import-meta': 'silent' },
    logLevel: 'warning',
  });
  return BUNDLE;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(await bundleServer());
}
