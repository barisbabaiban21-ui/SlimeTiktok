import { createHmac, timingSafeEqual } from 'node:crypto';
export function constantEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function sign(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}
export function verifySignature(secret: string, timestamp: string, signature: string, body: string, now = Date.now()): boolean {
  if (!/^\d{13}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature) || Math.abs(now - Number(timestamp)) > 60000) return false;
  return constantEqual(sign(secret, timestamp, body), signature);
}
export function pseudonym(secret: string, rawId: string): string {
  return createHmac('sha256', secret).update(rawId).digest('hex').slice(0, 24);
}
export class Limiter {
  private buckets = new Map<string, { n: number; until: number }>();
  constructor(private readonly capacity = 10000) {}
  allow(key: string, limit: number, period = 60000, now = Date.now()): boolean {
    if (this.buckets.size >= this.capacity) {
      for (const [k, v] of this.buckets) if (v.until <= now) this.buckets.delete(k);
      if (this.buckets.size >= this.capacity && !this.buckets.has(key)) return false;
    }
    let item = this.buckets.get(key);
    if (!item || item.until <= now) { item = { n: 0, until: now + period }; this.buckets.set(key, item); }
    return ++item.n <= limit;
  }
}
