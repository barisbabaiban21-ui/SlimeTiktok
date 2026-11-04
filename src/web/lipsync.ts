/** Mouth shape from Turkish text timing. Works with no TTS at all; audio level refines it when present. */
export interface Mouth { open: number; wide: number }
const OPEN: Record<string, Mouth> = {
  a: { open: 1, wide: 1.1 }, e: { open: 0.75, wide: 1.25 }, ı: { open: 0.45, wide: 1 }, i: { open: 0.4, wide: 1.3 },
  o: { open: 0.85, wide: 0.7 }, ö: { open: 0.7, wide: 0.7 }, u: { open: 0.55, wide: 0.6 }, ü: { open: 0.5, wide: 0.6 }
};
const LIPS = new Set(['m', 'b', 'p']);
export class LipSync {
  private text = ''; private start = 0; private duration = 1;
  speak(text: string, durationMs: number, now = performance.now()): void { this.text = text.toLocaleLowerCase('tr'); this.start = now; this.duration = Math.max(400, durationMs - 300); }
  stop(): void { this.text = ''; this.start = -Infinity; }
  get active(): boolean { return performance.now() - this.start < this.duration; }
  /** Fraction of the line already spoken, for karaoke captions. */
  progress(now = performance.now()): number { return Math.min(1, Math.max(0, (now - this.start) / this.duration)); }
  sample(now = performance.now(), audioLevel = 0): Mouth {
    const t = (now - this.start) / this.duration;
    if (t < 0 || t >= 1 || !this.text) return { open: 0, wide: 1 };
    const pos = t * this.text.length, i = Math.floor(pos), frac = pos - i;
    const ch = this.text[i] ?? ' ';
    let m: Mouth = OPEN[ch] ?? (LIPS.has(ch) ? { open: 0, wide: 0.9 } : /[\p{L}]/u.test(ch) ? { open: 0.25, wide: 1 } : { open: 0.05, wide: 1 });
    // Ease within each character so the jaw does not snap.
    const env = Math.sin(Math.PI * Math.min(1, frac * 1.3));
    m = { open: m.open * (0.55 + 0.45 * env), wide: m.wide };
    if (audioLevel > 0) m.open = Math.max(m.open * 0.4, audioLevel);
    return m;
  }
}
