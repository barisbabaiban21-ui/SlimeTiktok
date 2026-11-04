import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { GameState, Leader, Settings } from '../shared/types.js';

export class Store {
  readonly db: DatabaseSync;
  constructor(readonly path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, result TEXT NOT NULL, coins INTEGER NOT NULL, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS events_at ON events(at);
      CREATE TABLE IF NOT EXISTS streaks (id TEXT PRIMARY KEY, count INTEGER NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cooldowns (id TEXT PRIMARY KEY, until INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL, points REAL NOT NULL, coins INTEGER NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS daily (day TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, points REAL NOT NULL, coins INTEGER NOT NULL, PRIMARY KEY(day,id));
      CREATE TABLE IF NOT EXISTS blocked (id TEXT PRIMARY KEY);
    `);
    const version = this.get<number>('schema');
    if (version === 1) throw new Error('This database belongs to the old egg game; use a fresh DATA_DIR');
    if (version !== undefined && version !== 2) throw new Error('Unsupported database schema; restore a compatible backup');
    this.set('schema', 2);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  get<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM meta WHERE key=?').get(key);
    return row ? JSON.parse(String(row.value)) as T : undefined;
  }
  set(key: string, value: unknown): void {
    this.db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
  }
  save(state: GameState, settings: Settings): void { this.set('state', state); this.set('settings', settings); }
  seen(id: string): boolean { return !!this.db.prepare('SELECT 1 FROM events WHERE id=?').get(id); }
  record(id: string, user: string, kind: string, result: string, coins: number, at: number): void {
    this.db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?)').run(id, user, kind, result, coins, at);
  }
  giftDelta(id: string, count: number, now: number): number {
    const previous = Number(this.db.prepare('SELECT count FROM streaks WHERE id=?').get(id)?.count ?? 0);
    if (count <= previous) return 0;
    this.db.prepare('INSERT INTO streaks VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET count=excluded.count,at=excluded.at').run(id, count, now);
    return count - previous;
  }
  cooldown(id: string, duration: number, now: number): boolean {
    if (Number(this.db.prepare('SELECT until FROM cooldowns WHERE id=?').get(id)?.until ?? 0) > now) return false;
    this.db.prepare('INSERT INTO cooldowns VALUES(?,?) ON CONFLICT(id) DO UPDATE SET until=excluded.until').run(id, now + duration);
    return true;
  }
  credit(id: string, name: string, points: number, coins: number, now: number): void {
    this.db.prepare(`INSERT INTO players VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,points=points+excluded.points,coins=coins+excluded.coins,at=excluded.at`).run(id, name, points, coins, now);
    this.db.prepare(`INSERT INTO daily VALUES(?,?,?,?,?) ON CONFLICT(day,id) DO UPDATE SET
      name=excluded.name,points=points+excluded.points,coins=coins+excluded.coins`).run(new Date(now).toISOString().slice(0,10), id, name, points, coins);
  }
  leaders(now: number, names: boolean): Leader[] {
    return this.db.prepare('SELECT id,name,points,coins FROM daily WHERE day=? ORDER BY points DESC,id ASC LIMIT 8')
      .all(new Date(now).toISOString().slice(0,10)).map(r => ({ name: names ? String(r.name) : `Viewer ${String(r.id).slice(0,4).toUpperCase()}`, points: Number(r.points), coins: Number(r.coins) }));
  }
  isBlocked(id: string): boolean { return !!this.db.prepare('SELECT 1 FROM blocked WHERE id=?').get(id); }
  block(id: string, blocked: boolean): void {
    this.db.prepare(blocked ? 'INSERT OR IGNORE INTO blocked VALUES(?)' : 'DELETE FROM blocked WHERE id=?').run(id);
  }
  blocked(): string[] { return this.db.prepare('SELECT id FROM blocked LIMIT 1000').all().map(r => String(r.id)); }
  metrics(): { events: number; coins: number; players: number } {
    const result = this.db.prepare(`SELECT (SELECT count(*) FROM events) AS events,
      (SELECT coalesce(sum(coins),0) FROM players) AS coins,(SELECT count(*) FROM players) AS players`).get()!;
    return { events: Number(result.events), coins: Number(result.coins), players: Number(result.players) };
  }
  recent(): { id: string; kind: string; result: string; at: number }[] {
    return this.db.prepare('SELECT id,kind,result,at FROM events ORDER BY at DESC LIMIT 30').all().map(r => ({ id: String(r.id), kind: String(r.kind), result: String(r.result), at: Number(r.at) }));
  }
  prune(now: number): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM events WHERE at<?').run(now - 7 * 86400000);
      this.db.prepare('DELETE FROM streaks WHERE at<?').run(now - 86400000);
      this.db.prepare('DELETE FROM cooldowns WHERE until<?').run(now);
      this.db.prepare('DELETE FROM players WHERE at<?').run(now - 30 * 86400000);
      this.db.prepare('DELETE FROM daily WHERE day<?').run(new Date(now - 30 * 86400000).toISOString().slice(0,10));
    });
    this.db.exec('PRAGMA wal_checkpoint(PASSIVE)');
  }
  close(): void { this.db.close(); }
}
