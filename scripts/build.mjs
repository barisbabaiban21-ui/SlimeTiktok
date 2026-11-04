import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { build } from 'esbuild';
rmSync('dist', { recursive: true, force: true });
const compiler = process.platform === 'win32' ? 'tsc.cmd' : 'tsc';
const result = spawnSync(compiler, ['-p', 'tsconfig.json'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (result.status !== 0) process.exit(result.status ?? 1);
// tsc output for browser modules is not served: three.js uses bare imports. esbuild bundles one file.
rmSync('dist/src/web', { recursive: true, force: true });
// The character is sculpted as distance fields and baked to buffers once per build.
const bake = spawnSync(process.execPath, ['scripts/bake-character.mjs'], { stdio: 'inherit' });
if (bake.status !== 0) process.exit(bake.status ?? 1);
mkdirSync('dist/public', { recursive: true });
cpSync('public', 'dist/public', { recursive: true });
await build({ entryPoints: ['src/web/app.ts'], bundle: true, format: 'esm', target: 'es2022', minify: true, sourcemap: true,
  outfile: 'dist/public/web/app.js', legalComments: 'linked', logLevel: 'warning' });
console.log('Built server, browser bundle and static assets.');
