import { resolve } from 'node:path';
import { config } from './config.js';
import { Store } from './store.js';
import { GameService } from './service.js';
import { createApp } from './http.js';
import { createProvider, voiceOptions, VoiceService } from './voice.js';
import { warmLines } from './dialogue.js';
const cfg = config();
const store = new Store(resolve(cfg.dataDir, `${cfg.mode}.sqlite`));
const tts = voiceOptions(process.env);
const voice = new VoiceService(createProvider(process.env), cfg.dataDir, cfg.ttsVoice, tts);
const service = new GameService(store, cfg.mode, cfg.secret, voice);
const app = createApp(service, cfg);
let closing = false;
app.server.listen(cfg.port, cfg.host, () => {
  console.log(JSON.stringify({ event: 'started', mode: cfg.mode, port: cfg.port, host: cfg.host, voice: voice.provider?.name ?? 'none' }));
  // Fixed lines are voiced once, in the background, so most of the stream speaks without waiting.
  if (voice.ready && tts.prewarm) {
    const lines = warmLines();
    void voice.warm(lines, () => closing).then(made => console.log(JSON.stringify({ event: 'voice_warm', lines: lines.length, new: made, cached: voice.cached(), charsToday: voice.charsToday() })));
  }
});
app.server.on('error', err => { console.error(JSON.stringify({ event: 'server_error', type: err.name })); process.exitCode = 1; void app.close(); });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { closing = true; void app.close().then(() => process.exit(0)); setTimeout(() => process.exit(1), 8000).unref(); });
