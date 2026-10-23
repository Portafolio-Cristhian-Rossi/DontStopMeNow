// Arma release/DontStopMeNow-<os>-<arch>/: ejecutable autocontenido de Node (SEA) + web/ + LEEME.txt.
import { execSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postject from 'postject';
import { bundleServer } from './bundle-server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const osName = { win32: 'windows', linux: 'linux', darwin: 'macos' }[process.platform] ?? process.platform;
const name = `DontStopMeNow-${osName}-${process.arch}`;
const outDir = `${root}release/${name}`;
const exe = `${outDir}/DontStopMeNow${process.platform === 'win32' ? '.exe' : ''}`;
const work = `${root}dist/sea`;

console.log('1/5 Compilando la web…');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

console.log('2/5 Empaquetando el servidor…');
const bundle = await bundleServer();

console.log('3/5 Generando el blob del ejecutable…');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const config = {
  main: bundle,
  output: `${work}/sea-prep.blob`,
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
};
writeFileSync(`${work}/sea-config.json`, JSON.stringify(config, null, 2));
const blob = spawnSync(process.execPath, ['--experimental-sea-config', `${work}/sea-config.json`], {
  stdio: 'inherit',
});
if (blob.status !== 0) throw new Error('No se pudo generar el blob SEA');

console.log('4/5 Armando el ejecutable…');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
copyFileSync(process.execPath, exe);
if (process.platform !== 'win32') chmodSync(exe, 0o755);
await postject.inject(exe, 'NODE_SEA_BLOB', readFileSync(config.output), {
  sentinelFuse: SEA_FUSE,
  ...(process.platform === 'darwin' ? { machoSegmentName: 'NODE_SEA' } : {}),
});

console.log('5/5 Copiando la web y el LEEME…');
cpSync(`${root}apps/web/dist`, `${outDir}/web`, { recursive: true });
copyFileSync(`${root}scripts/LEEME.txt`, `${outDir}/LEEME.txt`);

console.log(`Listo: ${outDir}`);
