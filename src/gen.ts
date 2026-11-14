// Generator baris rintangan: fungsi murni (tanpa Three.js) supaya bisa dites.
export type Kind = 'train' | 'low' | 'high';
export type RowKind = 'breather' | 'lowAll' | 'highAll' | 'mixed';
export interface RowSpec {
  kind: RowKind;
  safe: number;                 // jalur aman (juga jalur koin)
  slots: (Kind | null)[];       // isi tiap jalur: kereta, rintangan rendah (lompat), rintangan atas (guling), kosong
}

export function difficultyOf(speed: number, start: number, max: number): number {
  return Math.min(1, Math.max(0, (speed - start) / (max - start)));
}

// Jeda waktu antar-baris (detik): 1.3 s di awal, 0.9 s di kesulitan penuh.
// Batas bawah 0.9 s > lama lompat (~0.65 s) sehingga lompat beruntun selalu mungkin.
export function gapSeconds(d: number): number {
  return 1.3 - 0.4 * d;
}

export function makeRow(rng: () => number, lastSafe: number, d: number): RowSpec {
  const cand = [lastSafe - 1, lastSafe, lastSafe + 1].filter((l) => l >= 0 && l <= 2);
  const safe = cand[Math.floor(rng() * cand.length)];
  const r = rng();
  if (r < 0.12) return { kind: 'breather', safe, slots: [null, null, null] };
  if (r < 0.30) return { kind: 'lowAll', safe, slots: ['low', 'low', 'low'] };
  if (r < 0.42 + 0.06 * d) return { kind: 'highAll', safe, slots: ['high', 'high', 'high'] };
  const slots: (Kind | null)[] = [null, null, null];
  for (let lane = 0; lane < 3; lane++) {
    if (lane === safe) continue;
    const t = rng();
    if (t < 0.4 + 0.3 * d) slots[lane] = 'train';
    else if (t < 0.75) slots[lane] = 'low';
    else if (t < 0.9) slots[lane] = 'high';
  }
  return { kind: 'mixed', safe, slots };
}
