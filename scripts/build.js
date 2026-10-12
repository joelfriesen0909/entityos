import { readdir, readFile, cp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await files(path)); else result.push(path);
  }
  return result;
}
const sources = await files(join(root, 'public'));
for (const file of [...sources.filter(f => f.endsWith('.js')), join(root, 'server.js')]) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
const html = await readFile(join(root, 'public/index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g)) {
  if (!sources.includes(join(root, 'public', match[1]))) throw new Error(`Missing asset: ${match[1]}`);
}
await rm(join(root, 'dist'), { recursive: true, force: true });
await cp(join(root, 'public'), join(root, 'dist'), { recursive: true });
console.log('Build erfolgreich: JavaScript geprüft und Web-Dateien nach dist/ kopiert.');
