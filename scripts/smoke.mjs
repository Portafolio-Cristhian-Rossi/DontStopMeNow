// Prueba de humo: arranca el ejecutable (o server.cjs), comprueba la API y la web, y lo cierra.
// Uso: node scripts/smoke.mjs <ruta al ejecutable o a server.cjs>
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('Uso: node scripts/smoke.mjs <ejecutable o server.cjs>');
  process.exit(2);
}

const port = await new Promise((resolve) => {
  const srv = createServer().listen(0, '127.0.0.1', () => {
    const { port: free } = srv.address();
    srv.close(() => resolve(free));
  });
});
const dataDir = mkdtempSync(join(tmpdir(), 'dsmn-smoke-'));
const [cmd, args] = target.endsWith('.cjs') ? [process.execPath, [target]] : [target, []];
const child = spawn(cmd, args, {
  env: { ...process.env, DSMN_DATA_DIR: dataDir, DSMN_PORT: String(port), DSMN_NO_BROWSER: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (d) => (output += d));
child.stderr.on('data', (d) => (output += d));

function finish(ok, message) {
  child.kill();
  setTimeout(() => {
    rmSync(dataDir, { recursive: true, force: true });
    console[ok ? 'log' : 'error'](ok ? `OK: ${message}` : `FALLÓ: ${message}\n--- salida ---\n${output}`);
    process.exit(ok ? 0 : 1);
  }, 500);
}

child.on('exit', (code) => finish(false, `el proceso terminó antes de tiempo (código ${code})`));

const base = `http://127.0.0.1:${port}`;
const deadline = Date.now() + 20_000;
for (;;) {
  try {
    const res = await fetch(`${base}/api/catalog`);
    if (res.status === 200) {
      const catalog = await res.json();
      if (typeof catalog.serverId !== 'string') throw new Error('catálogo inválido');
      break;
    }
  } catch {
    // todavía arrancando
  }
  if (Date.now() > deadline) finish(false, 'la API no respondió en 20 s');
  await new Promise((r) => setTimeout(r, 300));
}

const page = await fetch(`${base}/listas/abc`);
const html = await page.text();
if (page.status !== 200 || !html.includes('id="root"'))
  finish(false, `la web no respondió bien (${page.status})`);
else if (/ExperimentalWarning/.test(output))
  finish(false, 'la consola muestra el aviso experimental de SQLite');
else finish(true, `API y web responden en ${base}`);
