import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) { console.log('.env exists; left unchanged.'); process.exit(0); }
const env = readFileSync('.env.example', 'utf8')
  .replace(/^ADMIN_TOKEN=$/m, `ADMIN_TOKEN=${randomBytes(32).toString('hex')}`)
  .replace(/^WEBHOOK_SECRET=$/m, `WEBHOOK_SECRET=${randomBytes(32).toString('hex')}`);
writeFileSync('.env', env, { mode: 0o600 }); mkdirSync('data', { recursive: true });
console.log('Created .env with independent secrets. Read ADMIN_TOKEN locally to sign in. Never share .env.');
