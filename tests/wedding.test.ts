import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/server/store.js';
import { GameService } from '../src/server/service.js';
import { defaultSettings } from '../src/shared/validation.js';
import type { LiveEvent } from '../src/shared/types.js';

const make = () => new GameService(new Store(':memory:'), 'demo', 'wedding-test-secret');

function weddingGift(
  id: string,
  user: string,
  giftId: string,
  coins: number,
  now: number,
  repeat = 1
): LiveEvent {
  return {
    id,
    source: 'demo',
    roomId: 'turkish-wedding',
    timestamp: now,
    kind: 'gift',
    user: { id: user, name: user },
    gift: { id: giftId, name: 'Düğün Hediyesi', coins, repeat, streakId: id }
  };
}

test('halay starts with thirty roaches only for a selected gift ID at its exact coin price', () => {
  const game = make();
  try {
    const now = 100_000;
    game.ingest(weddingGift('wrong-id', 'Misafir', 'not-selected', 5, now), now);
    assert.equal(game.public(now).dancers.length, 0);

    game.ingest(weddingGift('wrong-price', 'Misafir', '5487', 10, now + 1), now + 1);
    assert.equal(game.public(now + 1).dancers.length, 0);

    const result = game.ingest(weddingGift('entry', 'Misafir', '5487', 5, now + 2), now + 2);
    assert.equal(result.status, 'applied');
    assert.equal(game.public(now + 2).dancers.length, 30);
  } finally {
    game.close();
  }
});

test('later entry gifts add at most five roaches per gift event', () => {
  const game = make();
  try {
    const now = 200_000;
    game.ingest(weddingGift('first', 'Birinci', '5487', 5, now), now);
    assert.equal(game.public(now).dancers.length, 30);

    game.ingest(weddingGift('second', 'İkinci', '5487', 5, now + 1, 20), now + 1);
    assert.equal(game.public(now + 1).dancers.length, 35);
  } finally {
    game.close();
  }
});

test('selected gifts worth at least one hundred coins assign halay leader, bride and groom roles', () => {
  const game = make();
  try {
    const now = 300_000;
    const selected = [
      ['leader', 'Halaycı', '5585', 100, 'halaybasi'],
      ['bride', 'Gelin', '5566', 100, 'gelin'],
      ['groom', 'Damat', '5660', 100, 'damat']
    ] as const;

    for (let i = 0; i < selected.length; i++) {
      const [id, user, giftId, coins] = selected[i]!;
      game.ingest(weddingGift(id, user, giftId, coins, now + i), now + i);
    }

    const dancers = game.public(now + 3).dancers;
    for (const role of ['halaybasi', 'gelin', 'damat']) {
      assert.equal(dancers.filter(dancer => dancer.role === role).length, 1, `one active ${role}`);
    }
    assert.ok(dancers.some(dancer => dancer.name === 'Halaycı' && dancer.role === 'halaybasi'));
    assert.ok(dancers.some(dancer => dancer.name === 'Gelin' && dancer.role === 'gelin'));
    assert.ok(dancers.some(dancer => dancer.name === 'Damat' && dancer.role === 'damat'));
  } finally {
    game.close();
  }
});

test('an unselected expensive gift cannot assign a wedding role', () => {
  const game = make();
  try {
    const now = 400_000;
    game.ingest(weddingGift('entry', 'Konuk', '5487', 5, now), now);
    game.ingest(weddingGift('fake-role', 'Sahte Damat', 'unknown-100', 500, now + 1), now + 1);
    assert.equal(game.public(now + 1).dancers.some(dancer => dancer.role), false);
  } finally {
    game.close();
  }
});

test('halay passes last ten minutes and an expired viewer can join again', () => {
  const game = make();
  try {
    const now = 500_000;
    game.ingest(weddingGift('entry', 'Aynı Misafir', '5487', 5, now), now);
    game.tick(100, now + 599_999);
    assert.equal(game.public(now + 599_999).dancers.length, 30);

    game.tick(100, now + 600_000);
    assert.equal(game.public(now + 600_000).dancers.length, 0);

    game.ingest(weddingGift('return', 'Aynı Misafir', '5487', 5, now + 600_001), now + 600_001);
    assert.equal(game.public(now + 600_001).dancers.length, 30);
  } finally {
    game.close();
  }
});

test('paused broadcasts do not open the wedding floor', () => {
  const game = make();
  try {
    const now = 600_000;
    game.control('pause');
    const result = game.ingest(weddingGift('paused-entry', 'Misafir', '5487', 5, now), now);
    assert.equal(result.status, 'recorded_paused');
    assert.equal(game.public(now).dancers.length, 0);
  } finally {
    game.close();
  }
});

test('the wedding floor is capped at sixty visible roaches', () => {
  const game = make();
  try {
    const now = 700_000;
    game.ingest(weddingGift('first', 'Birinci', '5487', 5, now), now);
    for (let i = 0; i < 10; i++) {
      const at = now + i + 1;
      game.ingest(weddingGift(`extra-${i}`, `Konuk-${i}`, '5487', 5, at, 5), at);
    }
    assert.equal(game.public(now + 20).dancers.length, 60);
  } finally {
    game.close();
  }
});

test('halay entry selection is controlled by the admin gift-rule checkbox', () => {
  const game = make();
  try {
    const settings = defaultSettings();
    settings.giftRules = settings.giftRules.map(rule =>
      rule.giftId === '5487' ? { ...rule, weddingEntry: false } : rule
    );
    game.configure(settings);
    const now = 800_000;
    game.ingest(weddingGift('disabled-entry', 'Misafir', '5487', 5, now), now);
    assert.equal(game.public(now).dancers.length, 0);

    settings.giftRules = settings.giftRules.map(rule =>
      rule.giftId === '5487' ? { ...rule, weddingEntry: true } : rule
    );
    game.configure(settings);
    game.ingest(weddingGift('enabled-entry', 'Misafir', '5487', 5, now + 1), now + 1);
    assert.equal(game.public(now + 1).dancers.length, 30);
  } finally {
    game.close();
  }
});
