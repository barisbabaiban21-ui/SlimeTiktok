import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export class Outbox {
  constructor(path, capacity = 5000) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path); this.capacity = capacity;
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS queue(id TEXT PRIMARY KEY,body TEXT NOT NULL,at INTEGER NOT NULL);');
  }
  size() { return Number(this.db.prepare('SELECT count(*) AS n FROM queue').get().n); }
  push(event) {
    if (this.db.prepare('SELECT 1 FROM queue WHERE id=?').get(event.id)) return;
    if (this.size() >= this.capacity) throw new Error('OUTBOX_FULL');
    this.db.prepare('INSERT INTO queue VALUES(?,?,?)').run(event.id, JSON.stringify(event), Date.now());
  }
  first() { return this.db.prepare('SELECT id,body,at FROM queue ORDER BY at,id LIMIT 1').get(); }
  remove(id) { this.db.prepare('DELETE FROM queue WHERE id=?').run(id); }
  clear() { this.db.exec('DELETE FROM queue'); }
  close() { this.db.close(); }
}
