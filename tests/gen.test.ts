import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRow, difficultyOf, gapSeconds } from '../src/gen.ts';

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('setiap baris selalu bisa dilewati (ada jalur tanpa kereta)', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const rng = mulberry32(seed);
    let safe = 1;
    for (let i = 0; i < 2000; i++) {
      const d = (i % 100) / 100;
      const row = makeRow(rng, safe, d);
      assert.ok(row.slots.some((s) => s !== 'train'), 'baris buntu');
      assert.notEqual(row.slots[row.safe], 'train', 'jalur aman berisi kereta');
      assert.ok(Math.abs(row.safe - safe) <= 1, 'pindah jalur terlalu jauh');
      safe = row.safe;
    }
  }
});

test('semua jenis baris muncul dan kesulitan memengaruhi jarak', () => {
  const rng = mulberry32(7);
  const seen = new Set<string>();
  for (let i = 0; i < 3000; i++) seen.add(makeRow(rng, 1, 0.5).kind);
  for (const k of ['breather', 'lowAll', 'highAll', 'mixed']) assert.ok(seen.has(k), k);
  assert.ok(gapSeconds(1) >= 0.9 && gapSeconds(0) <= 1.3);
  assert.equal(difficultyOf(16, 16, 38), 0);
  assert.equal(difficultyOf(99, 16, 38), 1);
});
