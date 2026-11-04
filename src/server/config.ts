import { resolve } from 'node:path';
import type { Mode } from '../shared/types.js';
export interface Config { host: string; port: number; origin: string; adminToken: string; secret: string; dataDir: string; mode: Mode; publicDir: string; ttsVoice: string }
export function config(env: NodeJS.ProcessEnv = process.env): Config {
  const adminToken = env.ADMIN_TOKEN ?? '', secret = env.WEBHOOK_SECRET ?? '';
  if (adminToken.length < 32 || secret.length < 32 || adminToken === secret) throw new Error('Run npm run setup: independent secrets of at least 32 characters are required');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
  const mode = env.MODE ?? 'demo';
  if (mode !== 'demo' && mode !== 'live') throw new Error('MODE must be demo or live');
  const origin = new URL(env.PUBLIC_ORIGIN ?? `http://localhost:${port}`).origin;
  return { host: env.HOST ?? '127.0.0.1', port, origin, adminToken, secret, mode,
    dataDir: resolve(env.DATA_DIR ?? 'data'), publicDir: resolve('dist/public'), ttsVoice: env.TTS_VOICE ?? '' };
}
