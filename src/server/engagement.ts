import { participationBadge } from '../shared/growth.js';
import type { GrowthMetrics, Welcome } from '../shared/growth.js';
import { Store } from './store.js';
const DAY = 86_400_000;
const day = (now: number): string => new Date(now).toISOString().slice(0, 10);

/** Additive migration. No raw IDs/names/chat, only the existing keyed pseudonyms. */
export class EngagementStore {
  constructor(private store: Store, now = Date.now()) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS engagement_days (
      day TEXT NOT NULL, user_id TEXT NOT NULL, first_at INTEGER NOT NULL,
      last_at INTEGER NOT NULL, actions INTEGER NOT NULL, gift_actions INTEGER NOT NULL,
      coins INTEGER NOT NULL, PRIMARY KEY(day,user_id));
      CREATE INDEX IF NOT EXISTS engagement_user_day ON engagement_days(user_id,day);`);
    if (store.get<number>('engagement_since') === undefined) store.set('engagement_since', now);
  }
  /** Must run inside the same transaction as gift deduplication and game persistence. */
  record(user: string, gift: boolean, coins: number, now: number): { firstToday: boolean; activeDays: number; badge: Welcome['badge'] } {
    const today = day(now);
    const firstToday = !this.store.db.prepare('SELECT 1 FROM engagement_days WHERE day=? AND user_id=?').get(today, user);
    this.store.db.prepare(`INSERT INTO engagement_days VALUES(?,?,?,?,1,?,?)
      ON CONFLICT(day,user_id) DO UPDATE SET last_at=excluded.last_at,
      actions=actions+1,gift_actions=gift_actions+excluded.gift_actions,coins=coins+excluded.coins`)
      .run(today, user, now, now, gift ? 1 : 0, coins);
    const activeDays = Number(this.store.db.prepare('SELECT count(*) AS n FROM engagement_days WHERE user_id=? AND day BETWEEN ? AND ?')
      .get(user, day(now - 29 * DAY), today)!.n);
    return { firstToday, activeDays, badge: participationBadge(activeDays) };
  }
  metrics(now = Date.now()): GrowthMetrics {
    const fromDay = day(now - 6 * DAY), throughDay = day(now);
    const totals = this.store.db.prepare(`SELECT count(*) AS participants,
      coalesce(sum(CASE WHEN gifts>0 THEN 1 ELSE 0 END),0) AS gifters,
      coalesce(sum(CASE WHEN days>1 THEN 1 ELSE 0 END),0) AS returning_count,
      coalesce(sum(coins),0) AS coins FROM (
        SELECT user_id,count(*) AS days,sum(gift_actions) AS gifts,sum(coins) AS coins
        FROM engagement_days WHERE day BETWEEN ? AND ? GROUP BY user_id)`)
      .get(fromDay, throughDay)!;
    const cohortDay = day(now - 2 * DAY), returnDay = day(now - DAY);
    const cohort = this.store.db.prepare(`SELECT count(*) AS eligible,
      coalesce(sum(CASE WHEN EXISTS(SELECT 1 FROM engagement_days b WHERE b.user_id=a.user_id AND b.day=?)
      THEN 1 ELSE 0 END),0) AS returned FROM engagement_days a WHERE a.day=?`).get(returnDay, cohortDay)!;
    const participants = Number(totals.participants), gifters = Number(totals.gifters);
    const eligible = Number(cohort.eligible), returned = Number(cohort.returned);
    const since = this.store.get<number>('engagement_since')!;
    const available = since <= Date.parse(`${cohortDay}T00:00:00Z`);
    return { since, fromDay, throughDay, participants, gifters,
      giftParticipationRate: participants ? gifters / participants : null,
      returningParticipants: Number(totals.returning_count), appliedCoins: Number(totals.coins),
      d1: { cohortDay, returnDay, eligible, returned, available,
        rate: available && eligible ? returned / eligible : null } };
  }
  prune(now: number): void {
    this.store.db.prepare('DELETE FROM engagement_days WHERE day<?').run(day(now - 29 * DAY));
  }
}
